function runService() {
  const input = document.getElementById("urlbar").value;
  fetch(`http://localhost:8080/proxy?url=${encodeURIComponent(input)}`)
    .then(response => response.text())
    .then(data => {
      console.log('Proxy result:', data);
      window.open(input, '_blank');
    })
    .catch(error => console.error('Error:', error));
}
