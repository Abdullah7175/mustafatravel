module.exports = {
  apps: [
    {
      name: "mustafa-frontend",
      cwd: "/opt/mustafa-frontend-final",
      script: "npm",
      args: "run dev",
      watch: ["src", "index.html"],
      ignore_watch: [".git", "node_modules", "dist", "build"],
      env: {
        NODE_ENV: "development"
      }
    }
  ]
}
