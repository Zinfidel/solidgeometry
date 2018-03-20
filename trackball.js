var mouseDown = false;
var lastTrackballPoint;
var canvas = document.getElementById("gl-canvas");

function handleMouseDown(event) {
    mouseDown = true;
    lastTrackballPoint = screenToTrackball(event.clientX, event.clientY);
}

function handleMouseUp(event) {
    mouseDown = false;
}

function handleMouseMove(event) {
    if (!mouseDown) {
        return;
    }
    else {
        var curTrackballPoint = screenToTrackball(event.clientX, event.clientY);
        var p1 = lastTrackballPoint;
        var p2 = curTrackballPoint;

        // Since we are using a unit trackball, the axis of rotation between
        // these two vectors is simply their cross product. The angle between
        // them is simply sin(theta), but we can use the small-angle
        // approximation to reduce that to just theta.
        var axis = cross(p1, p2);
        var theta = length(axis);
        theta *= 180 / Math.PI;

        // Protect against extremely small theta causing errors.
        if (theta < 1e-6) {
            return;
        }

        // Update old position with new position
        lastTrackballPoint = curTrackballPoint;

        // Update camera by adding incremental rotation matrix.
        //modelViewMatrix = add(modelViewMatrix, rotate(theta, axis));
        modelViewMatrix = mult(rotate(theta, axis), modelViewMatrix);
    }
}

/**
 * Maps screen coordinates to the surface of a virtual unit trackball.
 * @param {number} screenX Canvas X position under the mouse.
 * @param {number} screenY Canvas Y position under the mouse.
 * @returns {vec3} Point on virtual trackball under the mouse.
 */
function screenToTrackball(screenX, screenY) {
    var x, y, r2, z;

    var rect = canvas.getBoundingClientRect();
    screenX -= rect.left;
    screenY -= rect.top;

    // Normalize the click coordinates to [-1, 1].
    x = 2 * (screenX / canvas.width) - 1;
    y = 2 * ((canvas.height - screenY) / canvas.height) - 1;

    // r^2 = x^2 + y^2
    var r2 = x * x + y * y;

    // If the click was outside of the unit trackball sphere, then it maps to
    // a value of z = 0 (the plane of the hemisphere facing the camera).
    // Otherwise, z = sqrt(1 - r2) because x^2 + y^2 + z^2 = 1.
    z = r2 > 1 ? 0 : Math.sqrt(1 - r2);

    return vec3(x, y, z);
}