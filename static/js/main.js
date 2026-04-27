$(document).ready(function () {
    let pendingInstances = [];
    let deletingInstances = [];

    loadResources();
    loadInstances();
    loadLogs();

    // Auto-refresh the instances table every 3 seconds
    setInterval(loadInstances, 3000);

    // Centralize standard AJAX error handling for expired sessions Unauth
    $(document).ajaxError(function(event, jqXHR, ajaxSettings, thrownError) {
        if (jqXHR.status === 401) {
            window.location.href = "/login";
        }
    });

    $("#vm-launch-form").on("submit", function (e) {
        e.preventDefault();

        const formData = {
            name: $("#name").val(),
            image: $("#op-sys").val(),
            flavor: $("#flavor").val(),
            network: $("#network").val()
        };

        let dotCount = 0;
        $("#message").text("Launching VM");
        const submitBtn = $("#vm-launch-form button[type='submit']");
        submitBtn.prop("disabled", true).addClass("btn-locked").text("Launching...");
        
        // Add the instance to the UI immediately
        pendingInstances.push(formData.name);
        const optimisticRow = `
            <tr>
                <td>${formData.name}</td>
                <td>Requested...</td>
                <td><span class="status-build">BUILD</span></td>
                <td>N/A</td>
                <td>
                    <button class="btn btn-danger delete-btn" disabled>Delete</button>
                </td>
            </tr>
        `;
        $("#instance-list tbody").append(optimisticRow);

        const loadingInterval = setInterval(function() {
            dotCount = (dotCount + 1) % 4;
            $("#message").text("Launching VM" + ".".repeat(dotCount));
        }, 500);

        $.ajax({
            url: "/api/launch",
            type: "POST",
            contentType: "application/json",
            data: JSON.stringify(formData),
            timeout: 300000, // 5 minutes timeout to wait for OpenStack VM build
            success: function (response) {
                clearInterval(loadingInterval);
                pendingInstances = pendingInstances.filter(n => n !== formData.name);
                submitBtn.prop("disabled", false).removeClass("btn-locked").text("Launch VM");
                $("#message").text(response.message);
                $("#vm-launch-form")[0].reset();
                loadInstances();
                loadLogs();
            },
            error: function (xhr, status, error) {
                // If it's a proxy timeout or dropped connection from sitting too long:
                if (xhr.status === 504 || xhr.status === 502 || xhr.status === 0 || status === "timeout") {
                    let errorMessage = "Connection timed out. OpenStack is likely still building the VM in the background. Waiting...";
                    $("#message").text(errorMessage);
                    
                    let pollCount = 0;
                    let poller = setInterval(function() {
                        pollCount++;
                        if (pollCount > 24) { // Give up checking after 2 minutes
                            clearInterval(poller);
                            clearInterval(loadingInterval);
                            pendingInstances = pendingInstances.filter(n => n !== formData.name);
                            submitBtn.prop("disabled", false).removeClass("btn-locked").text("Launch VM");
                            $("#message").text("Still no confirmation. Please refresh the page manually later to check Active Instances.");
                            loadInstances();
                            return;
                        }

                        $.ajax({
                            url: "/api/logs",
                            type: "GET",
                            success: function(logResponse) {
                                // Find if there's any matching create action for this VM in recent logs
                                const matchedLog = logResponse.logs.find(
                                    l => (l.action || "").toLowerCase() === "create" && l.params && l.params.name === formData.name
                                );
                                
                                if (matchedLog) {
                                    clearInterval(poller);
                                    clearInterval(loadingInterval);
                                    pendingInstances = pendingInstances.filter(n => n !== formData.name);
                                    submitBtn.prop("disabled", false).removeClass("btn-locked").text("Launch VM");
                                    if (matchedLog.result === "success") {
                                        $("#message").text(`VM '${formData.name}' created successfully in the background!`);
                                        $("#vm-launch-form")[0].reset();
                                        loadInstances();
                                        loadLogs();
                                    } else {
                                        $("#message").text("Launch failed: " + matchedLog.result);
                                        loadInstances();
                                        loadLogs();
                                    }
                                }
                            }
                        });
                    }, 5000); // check every 5 seconds
                } else {
                    clearInterval(loadingInterval);
                    pendingInstances = pendingInstances.filter(n => n !== formData.name);
                    submitBtn.prop("disabled", false).removeClass("btn-locked").text("Launch VM");
                    let errorMessage = "Error: " + (error || "Unknown");
                    if (xhr.responseJSON && xhr.responseJSON.message) {
                        errorMessage = xhr.responseJSON.message;
                    }
                    $("#message").text(errorMessage);
                    loadInstances();
                    loadLogs();
                }
            }
        });
    });

    function loadInstances() {
        $.ajax({
            url: "/api/instances",
            type: "GET",
            success: function (response) {
                const tbody = $("#instance-list tbody");
                tbody.empty();

                const realNames = response.instances.map(inst => inst.name);
                // Important: Remove pending ones if they have been officially registered by the API
                pendingInstances = pendingInstances.filter(name => !realNames.includes(name));
                
                // Clear out tracked deletions once they genuinely disappear from OpenStack
                deletingInstances = deletingInstances.filter(name => realNames.includes(name));

                response.instances.forEach(function (instance) {
                    if (deletingInstances.includes(instance.name)) {
                        return; // Skip rendering VMs that we just locally deleted
                    }

                    let statusClass = 'status-default'; // Default class
                    const statusLower = instance.status.toLowerCase();
                    if (statusLower === 'active') {
                        statusClass = 'status-active';
                    } else if (statusLower === 'build') {
                        statusClass = 'status-build';
                    }

                    const row = `
                        <tr>
                            <td>${instance.name}</td>
                            <td>${instance.id}</td>
                            <td><span class="${statusClass}">${instance.status}</span></td>
                            <td>${instance.ip || "N/A"}</td>
                            <td>
                                <button class="btn btn-danger delete-btn" data-name="${instance.name}">Delete</button>
                            </td>
                        </tr>
                    `;
                    tbody.append(row);
                });

                // Render any remaining optimistic VMs
                pendingInstances.forEach(function (name) {
                    const row = `
                        <tr>
                            <td>${name}</td>
                            <td>Starting...</td>
                            <td><span class="status-build">BUILD</span></td>
                            <td>N/A</td>
                            <td>
                                <button class="btn btn-danger delete-btn" disabled>Delete</button>
                            </td>
                        </tr>
                    `;
                    tbody.append(row);
                });
            },
            error: function () {
                console.error("Failed to load instances.");
            }
        });
    }

    function loadResources() {
    $.ajax({
        url: "/api/resources",
        type: "GET",
        success: function(response) {
            const osSelect = $("#op-sys");
            osSelect.empty();
            osSelect.append('<option value="" disabled selected>-- Select an OS --</option>');
            response.images.forEach(function(image) {
                osSelect.append(`<option value="${image}">${image}</option>`);
            });

            const flavorSelect = $("#flavor");
            flavorSelect.empty();
            flavorSelect.append('<option value="" disabled selected>-- Select a Flavor --</option>');
            response.flavors.forEach(function(flavor) {
                flavorSelect.append(`<option value="${flavor}">${flavor}</option>`);
            });

            const networkSelect = $("#network");
            networkSelect.empty();
            networkSelect.append('<option value="" disabled selected>-- Select a Network --</option>');
            response.networks.forEach(function(network) {
                networkSelect.append(`<option value="${network}">${network}</option>`);
            });
        },
        error: function() {
            $("#message").text("Failed to load resources.");
        }
    });
    }

    function loadLogs() {
        $.ajax({
            url: "/api/logs",
            type: "GET",
            success: function (response) {
                const tbody = $("#logs-list tbody");
                tbody.empty();

                response.logs.forEach(function (log) {
                    let details = "";
                    if (log.params) {
                        const pairs = [];
                        if (log.params.name) pairs.push(`VM Name=${log.params.name}`);
                        if (log.params.image) pairs.push(`Image=${log.params.image}`);
                        if (log.params.flavor) pairs.push(`Flavor=${log.params.flavor}`);
                        if (log.params.network) pairs.push(`Network=${log.params.network}`);
                        if (log.params.key) pairs.push(`Keypair=${log.params.key}`);
                        details = pairs.join(", ");
                    }

                    const resultClass = log.result === 'success' ? 'status-success' : 'status-error';
                    
                    const row = `
                        <tr>
                            <td>${log.timestamp}</td>
                            <td>${log.user}</td>
                            <td><span style="text-transform: capitalize;">${log.action}</span></td>
                            <td>${log.instance_id || "N/A"}</td>
                            <td>
                                <span class="${resultClass}">${log.result}</span>
                            </td>
                            <td>${details}</td>
                        </tr>
                    `;
                    tbody.append(row);
                });
            },
            error: function () {
                console.error("Failed to load logs.");
            }
        });
    }

    $(document).on("click", ".delete-btn", function () {
        const vmName = $(this).data("name");
        const btn = $(this);

        // UI designed for immediate feedback
        btn.prop("disabled", true).addClass("btn-locked");
        btn.closest("tr").find("span[class^='status-']").removeClass().addClass("status-build").text("DELETING");

        $("#message").text(`Deleting ${vmName}...`);

        $.ajax({
            url: "/api/delete",
            type: "POST",
            contentType: "application/json",
            data: JSON.stringify({ name: vmName }),
            success: function (response) {
                // Instantly vanish the row from UI tracking upon HTTP 200 OK from OpenStack
                deletingInstances.push(vmName);
                btn.closest("tr").remove();

                $("#message").text(response.message);
                loadLogs();
                loadInstances();
            },
            error: function (xhr) {
                // Re-enable in case the deletion failed
                btn.prop("disabled", false).removeClass("btn-locked");
                btn.closest("tr").find("span[class^='status-']").removeClass().addClass("status-error").text("ERROR");

                let errorMessage = "Failed to delete VM.";

                if (xhr.responseJSON && xhr.responseJSON.message) {
                    errorMessage = xhr.responseJSON.message;
                }

                $("#message").text(errorMessage);
            }
        });
    });
});
