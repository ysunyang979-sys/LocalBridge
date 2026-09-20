console.log("Server starting up...");
console.log("Ready on port 3000");

let count = 0;
const interval = setInterval(() => {
  count++;
  console.log(`Heartbeat tick ${count}`);
  if (count % 3 === 0) {
    console.error(`Warning: sample stderr message ${count}`);
  }
}, 100);

process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down gracefully...");
  clearInterval(interval);
  process.exit(0);
});
