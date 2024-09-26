const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const cluster = require('cluster');
const os = require('os');

// Environment Variables
const PORT = process.env.PORT || 8080;
const WORKERS = process.env.WORKERS || os.cpus().length;

// Initialize Express app
const app = express();

// Middleware to secure headers and improve performance
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(compression()); // Compresses all responses

// Basic rate limiting to prevent abuse
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 100, // Limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Cluster setup to maximize CPU usage for performance boost
if (cluster.isMaster) {
  console.log(`Master ${process.pid} is running`);

  // Fork workers.
  for (let i = 0; i < WORKERS; i++) {
    cluster.fork();
  }

  // If a worker dies, restart it
  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });
} else {
  // Proxy Service Route
  app.get('/proxy', async (req, res) => {
    const { url } = req.query;

    // Basic URL validation
    if (!url || !url.startsWith('http')) {
      return res.status(400).send('Invalid URL parameter');
    }

    try {
      // Fetch URL and respond with the content
      const proxyResponse = await fetch(url);
      const data = await proxyResponse.text();

      // Return proxied data
      res.status(200).send(data);
    } catch (error) {
      console.error('Error fetching the URL:', error.message);
      res.status(500).send('Failed to fetch the requested page');
    }
  });

  // Start server
  app.listen(PORT, () => {
    console.log(`Worker ${process.pid} is running on port ${PORT}`);
  });
}
