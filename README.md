# OpenStack VM Provisioning Portal (MicroStack + Flask)

## Overview

This project implements a self-service VM provisioning portal using OpenStack (MicroStack) running inside a single Ubuntu 22.04 virtual machine. A Flask-based web application allows users to launch, view, and delete virtual machines using the OpenStack API via the `openstacksdk`.

The system demonstrates core OpenStack services including:

* **Nova** (compute) for VM lifecycle management
* **Neutron** (networking) for IP allocation and connectivity

It also includes a simple audit logging system to track user actions such as VM creation and deletion.

---

## Architecture

```
User (Web Browser)
        ↓
Flask Web Portal (app.py)
        ↓
openstacksdk
        ↓
MicroStack (OpenStack सेवices)
        ↓
Nova (Compute) + Neutron (Networking)
```

---

## System Requirements

* Ubuntu 22.04.5 Desktop (Virtual Machine)
* VirtualBox (or VMware)
* 4-8 vCPUs (recommended)
* 12-16 GB RAM (recommended)
* 60+ GB disk space
* Nested virtualization enabled

---

## Setup Instructions

### 1. Create Outer VM

Using VirtualBox:

* OS: Ubuntu 22.04.5 Desktop
* RAM: 12-16 GB
* CPUs: 4-8
* Enable:

  * PAE/NX
  * Nested Hardware Virtualization
  * Paravirtualization Interface: KVM

---

### 2. Install Base Packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install python3-openstackclient -y
sudo apt install python3-pip -y
pip install flask openstacksdk
sudo apt install git -y
sudo reboot
```

---

### 3. Install and Initialize MicroStack

```bash
sudo snap install microstack --devmode --beta
sudo microstack init --auto --control
```

---

### 4. Load OpenStack Credentials

```bash
source /var/snap/microstack/common/etc/microstack.rc
```
To verify successfully you can test with
```
openstack token issue
```

---

### 5. Verify Networking

MicroStack automatically creates networking resources, if you wish to check the status try:

```bash
openstack network list
```

---

### 6. Create Keypairs

```bash
mkdir -p ssh_keys

openstack keypair create student1-key > ssh_keys/student1-key.pem
openstack keypair create student2-key > ssh_keys/student2-key.pem

chmod 600 ssh_keys/*.pem
```

---

### 7. Project Setup

```bash
git clone https://github.com/KeanoAquino/openstack-vm-portal.git
cd openstack-vm-portal
```

Project structure:

```
openstack-vm-portal/
├── README.md
├── app.py
├── templates/
│   ├── index.html
│   └── login.html
├── static/
│   ├── css/style.css
│   └── js/main.js
└── audit.log
```

---

### 8. Run the Application
Whenever the application is ran, these commands are necessary:
```bash
source /var/snap/microstack/common/etc/microstack.rc
cd ~/openstack-vm-portal
python3 app.py
```

Access the portal at:

```
http://localhost:8080
```

---

## Default Users

| Username | Password    |
| -------- | ----------- |
| student1 | password123 |
| student2 | password456 |

---

## Features

* Launch virtual machines with:

  * Name
  * Image (CirrOS)
  * Flavor
  * Network
* View instance status:

  * BUILD → ACTIVE
* Display assigned IP address
* Delete virtual machines
* Per-user VM isolation using metadata
* Instance limit enforcement (max 2 per user)
* Audit logging system with:

  * User
  * Timestamp
  * Parameters
  * Result
  * Instance ID

---

## Demo / Testing Steps
Get the python application running with the three commands:
```
source /var/snap/microstack/common/etc/microstack.rc
cd ~/openstack-vm-portal
python3 app.py
```
Then:
1. Log in as **student1** using provided password above
2. Fill out all fields and launch a VM named `web-01`
3. Observe status transition from **BUILD → ACTIVE**
4. Confirm IP address is assigned
5. Check audit logs for creation entry
6. Fill out all fields and launch a second VM named `web-02`
7. Try to launch a third VM named `web-03`
8. Confirm failure message and resulting audit log
7. Delete a VM under Active Instances with the delete button and confirm removal
8. Verify deletion is logged

---

## Logging & Traceability

All actions are recorded in `audit.log`:

Each entry includes:

* Timestamp
* User
* Action (Create/Delete)
* Instance ID
* Result (success/failure)
* Parameters (name, image, flavor, network)

Logs are viewable directly in the web portal.

---

## Limitations & Design Notes

* Authentication is handled locally (not integrated with OpenStack Keystone)
* Logs are stored in a JSON file instead of a database
* Uses MicroStack single-node deployment (not production-grade multi-node OpenStack)
* Nested virtualization may impact performance
* SSH access to instances was not tested (IP assignment only verified)

---

## Possible Future Improvements

* Replace JSON logging with SQLite database
* Add floating IP support
* Enable SSH access verification
* Improve frontend with modern frameworks (e.g., React)

---

## Repository

GitHub: https://github.com/KeanoAquino/openstack-vm-portal

---

## Summary

This project demonstrates a complete OpenStack-based VM provisioning workflow, including:

* Single-node OpenStack deployment (MicroStack)
* API-driven VM creation using `openstacksdk`
* Web-based self-service portal
* Logging and user-level isolation

It fulfills all core requirements for building a lightweight cloud management interface on top of OpenStack.
