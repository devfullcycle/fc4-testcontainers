import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Home Page</title>
      </head>
      <body>
        <h1>Welcome to Express App</h1>
        <p>This is a simple Express.js application for E2E testing</p>
        <a href="/about">Go to About</a>
      </body>
    </html>
  `);
});

app.get('/about', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>About Page</title>
      </head>
      <body>
        <h1>About Us</h1>
        <p>This is the about page</p>
        <a href="/">Go to Home</a>
      </body>
    </html>
  `);
});

app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from API!' });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

export default app;
