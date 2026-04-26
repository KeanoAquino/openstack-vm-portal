# OpenStack Single-Node VM Portal

## 1. Project Overview

This project runs a single-node OpenStack environment inside one Ubuntu virtual machine and provides a user-facing Flask web portal for launching and managing inner virtual machines.

### Goals
- Run OpenStack inside one Linux VM using MicroStack.
- Allow a user to choose a VM name, image, flavor, network, and keypair.
- Launch, list, and delete VM instances.
- Maintain an audit trail of actions.

## 2. Architecture

### 2.1 High-Level Architecture
- **Host machine**: Personal computer running VirtualBox.
- **Outer VM**: Ubuntu 22.04.x VM.
- **OpenStack layer**: MicroStack single-node deployment.
- **User-facing tool**: Flask web portal.
- **Inner VMs**: Instances created by OpenStack inside the outer VM.

### 2.2 Main Components
- **Nova**: VM lifecycle management.
- **Neutron**: Networking.
- **Glance**: VM image registry.
- **Keystone**: Authentication and authorization.
- **openstacksdk**: Python API used by the web app.

## 3. Requirements

### 3.1 Host Machine Requirements
- VirtualBox installed.
- Hardware virtualization enabled in BIOS.
- Enough resources to support nested virtualization.

### 3.2 Recommended VM Resources
- **OS**: Ubuntu 22.04.x LTS
- **CPU**: 4 to 8 vCPU
- **RAM**: 12 to 16 GB
- **Disk**: 60+ GB
- **Network Adapter**: NAT

## 4. Ubuntu VM Setup

### 4.1 Create the VM
Create a new Ubuntu VM in VirtualBox with the resources listed above.

### 4.2 Important VirtualBox Settings
Before installing MicroStack, make sure the VM is configured correctly:

- Enable enough CPU cores.
- Enable **PAE/NX**.
- Set **Paravirtualization Interface** to **KVM**.
- Enable nested hardware virtualization.
- Do **not** use EFI unless specifically needed.

### 4.3 Nested Virtualization Notes
Nested virtualization must work before OpenStack can reliably launch inner VMs.

#### Verification command
```bash
egrep -c '(vmx|svm)' /proc/cpuinfo
```

Expected result:
- A value greater than `0`

If it returns `0`, nested virtualization is not working yet.

### 4.4 Sudo Verification
After Ubuntu is installed, confirm that the login user has sudo access:

```bash
sudo whoami
```

Expected result:
```bash
root
```

If the user is not in sudoers, fix that before continuing.

## 5. Base Package Installation

Run:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install snapd -y
sudo apt install python-openstackclient -y
sudo reboot
```

## 6. MicroStack Installation

Install MicroStack:

```bash
sudo snap install microstack --devmode --beta
```

Initialize OpenStack:

```bash
sudo microstack init --auto --control
```

Notes:
- This may take 15 to 20 minutes.
- If initialization appears to fail or behave inconsistently, verify services and endpoints before reinstalling.

## 7. Load OpenStack Credentials

In every new terminal session used for OpenStack or the web app, run:

```bash
source /var/snap/microstack/common/etc/microstack.rc
```

Verify authentication:

```bash
openstack token issue
```

## 8. OpenStack Verification and Troubleshooting Checks

Useful checks:

```bash
openstack service list
openstack endpoint list
openstack endpoint list --service image
openstack image list
sudo snap services microstack
```

These commands help confirm that services like Keystone, Nova, Neutron, and Glance are working correctly.

## 9. Networking Decision for This Project

This project does **not** use custom network, router, and subnet creation commands in its final workflow.

Instead, it uses the built-in OpenStack networks already available in the environment:
- **`test`**: used as the private/internal network for VM creation
- **`external`**: available as the built-in external network

### Important note
Do **not** create a separate custom `private-net`, `private-subnet`, or `router1` as part of this repo's required setup unless future changes explicitly require it.

To confirm the available networks, run:

```bash
openstack network list
```

## 10. Image and Keypair Setup

### 10.1 Upload CirrOS Image
Download the lightweight CirrOS image:

```bash
wget http://download.cirros-cloud.net/0.6.2/cirros-0.6.2-x86_64-disk.img
```

Upload it to OpenStack:

```bash
openstack image create "cirros" \
  --file cirros-0.6.2-x86_64-disk.img \
  --disk-format qcow2 \
  --container-format bare \
  --public
```

Verify:

```bash
openstack image list
```

### 10.2 Create Keypairs

```bash
mkdir -p ssh_keys
openstack keypair create student1-key > ssh_keys/student1-key.pem
openstack keypair create student2-key > ssh_keys/student2-key.pem
chmod 600 ssh_keys/*.pem
```

Verify:

```bash
openstack keypair list
```

## 11. Python Dependencies

Install Python tooling:

```bash
sudo apt install python3-pip -y
pip install openstacksdk flask
```

### Notes
- If `pip` warns that `flask` was installed in `~/.local/bin` and is not on `PATH`, that is acceptable if the app is run using `python3 app.py`.
- `openstacksdk` is required for the web app.

## 12. Project Setup

Create the project directory:

```bash
mkdir -p ~/vm-portal
cd ~/vm-portal
```

Expected project structure:

```text
vm-portal/
├── README.md
├── app.py
├── templates/
├── static/
└── audit.log
```

### 12.1 Web App Files
Place the Flask project files inside:

```text
~/vm-portal/
```

## 13. Web Portal Usage

Before running the web portal, make sure credentials are loaded:

```bash
source /var/snap/microstack/common/etc/microstack.rc
cd ~/vm-portal
```

### 13.1 Run the Web App
```bash
python3 app.py
```

### 13.2 Portal Authentication
The portal supports multi-tenant isolation. Use the following hardcoded credentials to log in:
- **User 1:** Username: `student1`, Password: `password123` (Assigned Key: `student1-key`)
- **User 2:** Username: `student2`, Password: `password456` (Assigned Key: `student2-key`)



## 14. Troubleshooting

### 14.1 Nested Virtualization Not Working
Symptom:
- `egrep -c '(vmx|svm)' /proc/cpuinfo` returns `0`

Things to check:
- VirtualBox nested virtualization enabled
- Host BIOS virtualization enabled
- Hyper-V disabled on Windows host if it interferes

### 14.2 User Does Not Have Sudo Access
Symptom:
- `sudo whoami` fails

Fix:
- Ensure the Ubuntu user is in sudoers before continuing.

### 14.3 `openstack` Command Not Found
Install the CLI package:

```bash
sudo apt install python-openstackclient -y
```

### 14.4 MicroStack Behaves Inconsistently
Useful commands:

```bash
sudo snap services microstack
openstack service list
openstack endpoint list
openstack image list
```

### 14.5 Flask PATH Warning
If `pip` warns that the `flask` script is not on `PATH`, continue using:

```bash
python3 app.py
```

