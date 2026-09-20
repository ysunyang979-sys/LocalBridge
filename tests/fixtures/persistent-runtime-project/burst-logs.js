console.log("Starting burst log emission...");
for (let i = 0; i < 60000; i++) {
  console.log(`[BurstLine-${i}] High volume log emission line to test buffer overflow and truncation behavior with sufficiently large text`);
}
console.log("Finished burst log emission");
const interval = setInterval(() => {}, 100);
process.on("SIGTERM", () => {
  clearInterval(interval);
  process.exit(0);
});
