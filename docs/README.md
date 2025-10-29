# BruteForce — Demo Project

> **Educational-only project** showing how login systems can be hardened against brute-force, dictionary, and rainbow-table attacks.
> Includes backend, frontend, and multiple safe attack simulations — all running **locally**.

**Never test against external or real systems.**
This demo is strictly for **security education and local testing**.

## Table of Contents

* [Overview](#overview)
* [Prerequisites](#prerequisites)
* [Install](#install)
* [Structure](#project-structure)
* [Expected user data](#expected-user-data)
* [Run demo backend](#run-demo-backend)
* [Create users](#create-users)
* [Attack scripts](#attack-scripts)
* [Security & Ethics](#security--ethics-must-read)

## Overview

This project demonstrates:

* Minimal **Express-based login backend**
* **Modern login UI** with clear error messages
* **UTF-8 Unicode charset support**
* Attack simulations for:

  * Brute-force (`crack.js`)
  * Dictionary + mutation (`crack2.js`)
  * Rainbow table (`crack3.js --mode create/rainbow`)
* Safe **local testing environment**

## Prerequisites

* Node.js ≥ 16
* npm
* Terminal or PowerShell

---

## Install

```bash
npm install
```

If some packages are missing:

```bash
npm install express node-fetch bcryptjs fs-extra morgan express-rate-limit
```

---

## Project Structure

```
BruteForce/
├─ attacks/
│  ├─ crack.js              # Extended charset brute-force attack
│  ├─ crack2.js             # Dictionary + personal data mutation attack
│  ├─ crack3.js             # Rainbow Table + Parallel Instances attack
│  ├─ rainbow_table.json    # Optional precomputed hashes
│  └─ dictionary.txt        # Optional extra words
├─ public/
│  ├─ Backend.js            # Express backend
│  ├─ index.html            # Modern login UI
│  └─ TEST_DATA/
│     └─ users.json         # Local user database
├─ docs/
│  └─ README.md             # This file
└─ package.json
```

---

## Expected User Data

**`TEST_DATA/users.json`**

```json
[
  { "username": "test", "password": "test1" },
  { "username": "admin", "password": "admin" }
]
```

---

## Run Demo Backend

```bash
node public/Backend.js
```

Visit [http://localhost:3000/login](http://localhost:3000/login)

---

## Create Users

### Option 1: Plaintext

Edit `TEST_DATA/users.json` manually.

### Option 2: Hashed (using bcrypt)

```bash
node -e "const bcrypt=require('bcryptjs');(async(p)=>console.log(await bcrypt.hash(p,10)))(process.argv[1])" "MyS3cret!"
```

## Safe Testing

All attacks operate **only against the local server** (`localhost:3000/login`).

## Attack Scripts

### 1. `crack.js` — Brute-Force (UTF-8 / Extended Charset)

**Simulates:**

* Systematic password search using configurable character sets
* Full Mono-Alphabet support (lowercase, uppercase, numbers, symbols)

```bash
node attacks/crack.js <username> <charset> <maxlen>
```

#### Available charsets:

| Name      | Characters included                    |          |
| --------- | -------------------------------------- | -------- |
| `digits`  | `0123456789`                           |          |
| `lower`   | `abcdefghijklmnopqrstuvwxyz`           |          |
| `upper`   | `ABCDEFGHIJKLMNOPQRSTUVWXYZ`           |          |
| `symbols` | `!@#$%^&*()_+-=[]{}                    | ;:,.<>?` |
| `mixed`   | Letters, numbers, and symbols combined |          |

Example:

```bash
node attacks/crack.js alice mixed 4
```

---

### 2. `crack2.js` — Personal Data Dictionary + Mutations

**Simulates:**

* Leetspeak, capitalization, and year/suffix mutations
* Smart combinations of known info (email, name, birth year)
* Optional fallback to full Unicode brute-force

Run:

```bash
node attacks/crack2.js <username>
```

---

### 3. `crack3.js` — Rainbow Table Mode + Parallel Instances

Build and use precomputed hash-password maps.

**Create table:**

```bash
node attacks/crack3.js <username> create
```

**Use table:**

```bash
node attacks/crack3.js <username> rainbow
```

Rainbow tables are stored as:

```
attacks/rainbow_table.json
```

**Parallel Instances:**

```bash
node attacker.js <username> bruteforce 0 4    # Instanz 1 von 4
node attacker.js <username> bruteforce 1 4    # Instanz 2 von 4
node attacker.js <username> bruteforce 2 4    # Instanz 3 von 4
node attacker.js <username> bruteforce 3 4    # Instanz 4 von 4
```

## Security & Ethics (Must Read)

> **Use only in a controlled, local environment.**

* Never attack networks or systems without written consent.
* Brute-force attacks, even educational ones, can **cause denial-of-service** if misused.
* This repository is intended for **learning, classroom demonstrations, and security testing**.

## PowerShell Example — Parallel Testing

```powershell
$Dir = "C:\BruteForce\attacks"
for ($i = 0; $i -lt <number_of_instances>; $i++) {
    $cmd = "Set-Location `"$Dir`"; node <file_name>.js <username> bruteforce $i <number_of_instances>"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd
}
```

execute using:
```powershell
powershell -ExecutionPolicy Bypass -File "C:\<path>\<to>\<bruteforce>\<project>\BruteForce\attacks\<file_name>.ps1"
```
