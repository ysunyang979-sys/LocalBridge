const forbidden = ["LB_", "LBR_", "LM_", "LOCALBRIDGE_", "OPENAI_", "TUNNEL_", "MANAGEMENT_", "BEARER", "AUTHORIZATION"];
const leaked = [];
for (const key of Object.keys(process.env)) {
  const upper = key.toUpperCase();
  if (forbidden.some((p) => upper.startsWith(p) || upper === p)) {
    leaked.push(key);
  }
}
if (leaked.length > 0) {
  console.error("SECRET_DETECTED: " + leaked.join(","));
  process.exit(1);
} else {
  console.log("SECRETS_CLEAN: OK");
}
const timer = setTimeout(() => {
  process.exit(0);
}, 200);
process.on("SIGTERM", () => {
  clearTimeout(timer);
  process.exit(0);
});
