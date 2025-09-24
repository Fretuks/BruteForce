const express = require('express');
const fs = require('fs');
const app = express();
const port = 3000;

app.use(express.json());

const users = JSON.parse(fs.readFileSync('users.json', 'utf8'));
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username && u.password === password);

  if (user) {
    res.send('Login erfolgreich');
  } else {
    res.status(401).send('Falscher Benutzername oder Passwort');
  }
});

app.listen(port, () => {
  console.log(`läuft http://localhost:${port}`);
});
