# BruteForce — Demo Project

> Small educational demo showing a tiny login backend, simple frontend, and several local-only attack/defense experiments.

> **Important:** This repository is for learning **only**. Do **not** use the included attack scripts against systems you do not own or explicitly have written permission to test. See **Safety & Ethics** below.

---

## Table of contents

* [Overview](#overview)
* [Prerequisites](#prerequisites)
* [Install](#install)
* [Project structure](#project-structure)
* [Expected `users.json` formats](#expected-usersjson-formats)
* [Run the demo server (naive login)](#run-the-demo-server-naive-login)
* [Create users (plaintext and bcrypt)](#create-users-plaintext-and-bcrypt)
* [Safe testing — local simulation (recommended)](#safe-testing--local-simulation-recommended)
* [Attacks folder — ethical warning](#attacks-folder--ethical-warning)
* [Security & Ethics (must read)](#security--ethics-must-read)

---

## Overview

This repository demonstrates:

* a minimal Express login server (naive password check)
* a simple static frontend (`index.html`) that posts login credentials
* educational scripts showing brute-force concepts, dictionary mutations and a *local-only* simulation harness for safe demonstrations
* suggestions and code examples for defensive measures (rate limiting, progressive delay, lockout, bcrypt)

This is intended for classroom use only.

---

## Prerequisites

* Node.js (v14+ recommended) and `npm`
* Terminal / command line

---

## Install

Clone or copy the repository, then install dependencies:

```bash
npm install
```

If additional packages are required by specific scripts (e.g. `node-fetch`, `bcryptjs`, `express-rate-limit`, `morgan`), install them as needed:

```bash
npm install bcryptjs node-fetch express express-rate-limit morgan fs-extra
```

---

## Project structure

```
BruteForce/
├─ .idea/
├─ attacks/
│  ├─ crack.js
│  ├─ crack2.js
│  └─ dictionary.txt
├─ docs/
│  └─ README.md   <- (this file)
├─ public/
│  ├─ Backend.js   <- naive Express server
│  └─ index.html   <- simple login page
├─ TEST_DATA/
│  └─ users.json
├─ package.json
└─ package-lock.json
```

---

## Expected `users.json` formats

The code in this repo expects one of the following formats. If scripts report `USER_NOT_FOUND`, check your JSON shape.

**Preferred (object with `users` array):**

```json
{
  "users": [
    { "username": "test", "password": "test" }
  ]
}
```

**Alternate (array of users):**

```json
[
  { "username": "test", "password": "test" },
  { "username": "alice", "passwordHash": "$2a$10$..." }
]
```

Fields used by scripts:

* `username` — string
* `password` — plaintext (demo only)
* `passwordHash` — bcrypt hash (recommended for demo realism)

---

## Run the demo server (naive login)

> This demo server reads `TEST_DATA/users.json`. By default the example server is intentionally minimal.

Start the server:

```bash
node public/Backend.js
```

Open the demo frontend in your browser:

```
http://localhost:3000/login
```

The page sends a JSON `POST`:

```json
{ "username": "test", "password": "test" }
```

---

## Create users

### Plaintext users (demo only)

Edit `TEST_DATA/users.json` and add user objects in the expected format.

**Warning:** Do **not** store plaintext passwords in production.

### Bcrypt (preferred for demos)

Generate a bcrypt hash and store it as `passwordHash`:

```bash
node -e "const bcrypt=require('bcryptjs');(async(p)=>console.log(await bcrypt.hash(p,10)))(process.argv[1]) S3cret!"
```

Then in `users.json`:

```json
{
  "users": [
    { "username": "alice", "passwordHash": "$2a$10$..." }
  ]
}
```

If your server code performs `bcrypt.compare`, it will validate hashed passwords.

---

## Safe testing — local simulation (recommended)

To explore brute-force behavior **safely**, use a local simulation harness that calls the login logic in-process (no network requests). This demonstrates:

* progressive delay (server-side slowing)
* account lockout after repeated failures
* performance metrics (attempts/s) against a local hash

Example usage:

```bash
node crack.js <username> <charset> <maxlen>
# e.g.
node crack.js test digits 4
```

```bash
node crack2.js <username> <maxlen>
# e.g.
node crack2.js test 4
```

This approach is safe for demonstrations and class assignments because it does not send guesses over the network to external targets.

---

## `attacks/` folder — ethical warning

The `attacks/` folder contains example scripts that illustrate:

* candidate generation (charset iteration)
* dictionary mutation techniques

**Important:** Those scripts are for educational analysis only. **Do not** run them against remote systems you do not own or have explicit permission to test.

---

## Security & Ethics (must read)

* These materials are for **educational** purposes only.
* Creating or running automated tools that attempt to access systems without authorization is illegal in many jurisdictions and ethically wrong.
* Never use the attack scripts on systems you do not own or explicitly have permission to test.
* Prefer the local simulation or secure test-mode endpoint for demonstrations and grading.
* Remove any test credentials and disable test endpoints after you finish.
