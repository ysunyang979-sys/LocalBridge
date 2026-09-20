const code = parseInt(process.argv[2] || "1", 10);
console.error(`Process exiting with code ${code}`);
process.exit(code);
