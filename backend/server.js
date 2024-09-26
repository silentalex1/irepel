const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const helmet = require('helmet');
const cluster = require('cluster');
const os = require('os');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const { URL } = require('url');
const compression = require('compression');
const morgan = require('morgan');
const Redis = require('ioredis');
const NodeCache = require('node-cache');

const app = express();
const PORT = process.env.PORT || 8080;
const WORKERS = process.env.WORKERS || os.cpus().length;

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(morgan('combined'));

const redis = new Redis(process.env.REDIS_URL);
const localCache = new NodeCache({ stdTTL: 60, checkperiod: 120 });

const rateLimiter = new RateLimiterMemory({
  points: 20,
  duration: 1,
});

const whitelist = new Set(['example.com', 'api.example.com']);

const proxyHandler = async (req, res) => {
  const urlParam = req.query.url;

  if (!urlParam) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  try {
    const url = new URL(urlParam);
    
    if (!whitelist.has(url.hostname)) {
      return res.status(403).json({ error: 'Domain not allowed' });
    }

    await rateLimiter.consume(req.ip);

    const cacheKey = `proxy:${url.toString()}`;
    let cachedResponse = localCache.get(cacheKey);

    if (!cachedResponse) {
      cachedResponse = await redis.get(cacheKey);
      if (cachedResponse) {
        localCache.set(cacheKey, cachedResponse);
      }
    }

    if (cachedResponse) {
      const { contentType, body } = JSON.parse(cachedResponse);
      res.type(contentType || 'text/plain');
      return res.status(200).send(body);
    }

    const response = await fetch(url.toString(), { 
      timeout: 5000,
      headers: {
        'User-Agent': 'UnblockerProxy/2.0',
        'Accept-Encoding': 'gzip, deflate, br',
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const contentType = response.headers.get('content-type');
    const body = await response.text();

    const cacheValue = JSON.stringify({ contentType, body });
    localCache.set(cacheKey, cacheValue);
    redis.set(cacheKey, cacheValue, 'EX', 300);

    res.type(contentType || 'text/plain');
    res.status(200).send(body);

  } catch (error) {
    console.error('Error:', error);

    if (error instanceof Error) {
      if (error.name === 'FetchError') {
        res.status(504).json({ error: 'The requested URL is unreachable.' });
      } else if (error.name === 'RateLimiterRes') {
        res.status(429).json({ error: 'Too many requests. Please try again later.' });
      } else if (error.name === 'TypeError' && error.message.includes('Invalid URL')) {
        res.status(400).json({ error: 'Invalid URL provided.' });
      } else {
        res.status(500).json({ error: 'An internal server error occurred.' });
      }
    } else {
      res.status(500).json({ error: 'An unknown error occurred.' });
    }
  }
};

app.get('/proxy', proxyHandler);

app.get('/health', (req, res) => res.status(200).json({ status: 'OK' }));

if (cluster.isMaster) {
  console.log(`Master ${process.pid} is running`);

  for (let i = 0; i < WORKERS; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });
} else {
  app.listen(PORT, () => {
    console.log(`Worker ${process.pid} is listening on port ${PORT}`);
  });
}

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  app.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});
