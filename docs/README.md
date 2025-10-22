# BruteForce — Demo Project

> Small educational demo showing a minimal login backend, basic frontend, and **five** brute-force attack scripts for safe, local testing and security education.

> **This is for educational use only. Never attack systems without explicit permission.**

---

## Table of contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Install](#install)
- [Project structure](#project-structure)
- [Expected `users.json` formats](#expected-usersjson-formats)
- [Run the demo server](#run-the-demo-server)
- [Create users](#create-users)
- [Safe testing (recommended)](#safe-testing-recommended)
- [Attack scripts](#attack-scripts)
- [Security & Ethics (must read)](#security--ethics-must-read)

---

## Overview

This project demonstrates:

- A minimal Express-based login backend
- A static frontend with form-based login
- Five Node.js scripts simulating brute-force/dictionary/rainbow attacks
- Local-only and safe multi-instance testing
- User/password storage in plaintext and bcrypt
- Clear separation between demo functionality and security attack simulation

---

## Prerequisites

- Node.js (v14+)
- `npm`
- Terminal (or PowerShell)

---

## Install

```bash
npm install
````

If missing packages cause errors, install them explicitly:

```bash
npm install bcryptjs node-fetch express express-rate-limit morgan fs-extra
```

---

## Project structure

```
BruteForce/
├─ attacks/
│  ├─ crack.js        # Mono charset brute force
│  ├─ crack2.js       # Dictionary + mutations
│  ├─ crack3.js       # Rainbow table
│  ├─ crack4.js       # Parallel brute force
│  ├─ crack5.js       # Hybrid attack framework
│  ├─ dictionary.txt
│  ├─ rainbow_table.json
│  └─ wordlist.txt
├─ public/
│  ├─ Backend.js      # Express server
│  └─ index.html      # Login form
├─ TEST_DATA/
│  └─ users.json
├─ docs/
│  └─ README.md       # This file
└─ package.json
```

---

## Expected `users.json` formats

### Preferred structure:

```json
{
  "users": [
    { "username": "alice", "password": "plaintext" },
    { "username": "bob", "passwordHash": "$2a$10$..." }
  ]
}
```

---

## Run the demo server

```bash
node public/Backend.js
```

Visit: `http://localhost:3000/login`

---

## Create users

### Option 1: Plaintext (demo only)

Edit `users.json` manually.

### Option 2: Hashed (recommended)

```bash
node -e "const bcrypt=require('bcryptjs');(async(p)=>console.log(await bcrypt.hash(p,10)))(process.argv[1])" "S3cret!"
```

Then insert the hash into `users.json` under `passwordHash`.

---

## Safe testing (recommended)

All attacks simulate authentication attempts **locally** and do not target remote systems.

---

## Attack Scripts

### 1. `crack.js` – Mono-Zeichensatz Brute Force

**Simulates:**

* Pure brute force using a restricted character set (`digits`, `lower`, `upper`)
* Exhaustive search up to configurable length

```bash
node crack.js <username> <charset> <maxlen>
```

Example:

```bash
node crack.js alice digits 4
```

---

### 2. `crack2.js` – Dictionary + Mutation Attack

**Simulates:**

* Dictionary-based password guessing
* Case variants, common suffixes, and leetspeak
* Limited to local dictionary and mutation rules

```bash
node crack2.js <username> <maxlen>
```

---

### 3. `crack3.js` – Rainbow Table

**Simulates:**

* Use of precomputed hash-password maps
* Includes script for building a rainbow table from a dictionary

```bash
node crack3.js <username> rainbow
node crack3.js <username> create     # To build rainbow table
```

---

### 4. `crack4.js` – Parallel Brute Force

**Simulates:**

* Brute-force attack split across multiple instances
* Each instance works on a portion of the keyspace

```bash
node crack4.js <username> bruteforce <instanceId> <totalInstances>
```

Example (Instance 2 of 4):

```bash
node crack4.js alice bruteforce 1 4
```

---

### 5. `crack5.js` – Hybrid Framework (Full Simulation Suite)

**Simulates:**

* Dictionary + Rainbow + Brute-force
* Multi-instance parallelism
* Shared state file to halt on success
* Tracks stats, request speed, response time, success/failure logs
* Also supports username enumeration

```bash
node crack5.js <username> <mode> <instanceId> <totalInstances>
```

Modes:

* `dictionary`
* `bruteforce`
* `rainbow`
* `create-table`
* `enumerate`
* `hybrid` (dictionary → brute-force)

Example:

```bash
node crack5.js admin hybrid 0 4
```

---

## Security & Ethics (must read)

> **DO NOT** use any attack scripts against systems you do not own.

* These tools are **for learning and classroom use only**
* Use only against the demo server or authorized systems
* Violating ethical guidelines or legal boundaries may lead to severe consequences
* When in doubt, ask for explicit permission before testing

---

## PowerShell: Launch Parallel Instances (Example)

```powershell
$WorkingDir = "C:\Users\your_username\your_project_folder\BruteForce\attacks"  #

for ($i = 0; $i -lt 10; $i++) {
    $cmd = "Set-Location -Path `"$WorkingDir`"; node crack5.js test hybrid $i 10"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd
    Start-Sleep -Milliseconds 100
}
```
Execute powershell script locally:
```
powershell -ExecutionPolicy Bypass -File "C:\Users\your_username\your_project_folder\BruteForce\attacks\open_10_terminals_windows.ps1"
```

---

## ✅ Final Notes

* `crack5.js` is the most advanced and recommended for robust demos
* Use the naive server (`Backend.js`) for all testing
* Monitor server logs and browser output during attacks

```
