// WebGL context
var gl;
var canvas;
var program;

// Camera Matrices
var modelViewMatrix;
var ProjectionMatrix;

// Framebuffers
var pickFrameBuffer;

// Shader Attribute Pointers
var vPosition;

// Shader Uniform Pointers
var uColor;
var uNormal;
var uLight;
var uInstance;
var uNormalMatrix;
var uModelView;
var uProjection;
var uRenderMode;
var uPickColor;

// Geometry data structures
var meshes = [];
var selected = null;
var wireColor = new Float32Array([0, 0, 0, 1]);
var selectedColor = new Float32Array([1, 1, 1, 1]);
var picked = null;
var boolGeo1, boolGeo2;

window.onload = function init() {

    // Set up the WebGL canvas and context.
    canvas = document.getElementById("gl-canvas");
    gl = WebGLUtils.setupWebGL(canvas);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.5, 0.5, 0.5, 1.0);

    // Depth testing and polygon offset.
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    //gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1.0, 2.0);

    // Allocate the color picking framebuffer.
    pickFrameBuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, pickFrameBuffer);

    // Set up color attachment texture for the color picking framebuffer.
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0,
            gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.generateMipmap(gl.TEXTURE_2D);

    // Create a rendering buffer with depth information.
    var pickRenderbuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, pickRenderbuffer);
    gl.renderbufferStorage(
            gl.RENDERBUFFER,
            gl.DEPTH_COMPONENT16,
            canvas.width, canvas.height);

    // Attach color buffer
    gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D,
            texture, 0);

    // Attach the render buffer
    gl.framebufferRenderbuffer(
            gl.FRAMEBUFFER,
            gl.DEPTH_ATTACHMENT,
            gl.RENDERBUFFER,
            pickRenderbuffer);

    // Rebind original framebuffer
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    //  Load shaders.
    program = initShaders(gl, "vertex.glsl", "fragment.glsl");
    gl.useProgram(program);

    // Get shader attribute locations.
    vPosition = gl.getAttribLocation(program, "vPosition");

    // Get shader uniform locations.
    uColor = gl.getUniformLocation(program, "Color");
    uNormal = gl.getUniformLocation(program, "Normal");
    uLight = gl.getUniformLocation(program, "Light");
    uInstance = gl.getUniformLocation(program, "Instance");
    uNormalMatrix = gl.getUniformLocation(program, "NormalMatrix");
    uModelView = gl.getUniformLocation(program, "ModelView");
    uProjection = gl.getUniformLocation(program, "Projection");
    uRenderMode = gl.getUniformLocation(program, "RenderMode");
    uPickColor = gl.getUniformLocation(program, "PickColor");

    // Set up camera.
    modelViewMatrix = identityMatrix();
    ProjectionMatrix = ortho(-2, 2, -2, 2, -5, 5);

    // Set up the light source.
    gl.uniform4fv(uLight, flatten(vec4(-1, 1, 1, 0)));

    AttachEventHandlers();
    render();
};

function render(timeStamp, renderMode, clickEvent) {

    // Set the rendering mode uniform. 0 is normal, 1 is for picking.
    if (!renderMode) renderMode = 0;
    gl.uniform1i(uRenderMode, renderMode);
    if (renderMode === 1) gl.bindFramebuffer(gl.FRAMEBUFFER, pickFrameBuffer);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Set up the camera uniforms.
    gl.uniformMatrix4fv(uModelView, gl.FALSE, flatten(modelViewMatrix));
    gl.uniformMatrix4fv(uProjection, gl.FALSE, flatten(ProjectionMatrix));

    // Render each mesh.
    for (var i = 0; i < meshes.length; i++) {
        var curMesh = meshes[i];

        // Pass in instance transform.
        gl.uniformMatrix4fv(
                uInstance,
                gl.FALSE,
                flatten(curMesh.geometry.instance)
                );

        // Pass in normal transform.
        gl.uniformMatrix4fv(
                uNormalMatrix,
                gl.FALSE,
                flatten(curMesh.geometry.normalMatrix)
                );

        // Pass in the pick color for this mesh.
        gl.uniform1i(uPickColor, curMesh.id);

        // Bind the mesh's buffer and attributes to the buffer.
        gl.bindBuffer(gl.ARRAY_BUFFER, curMesh.vbo);
        gl.vertexAttribPointer(vPosition, 4, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(vPosition);

        // Render each polygon
        for (var j = 0; j < curMesh.geometry.polygons.length; j++) {
            curPoly = curMesh.geometry.polygons[j];

            // Pass in the vertex's normal (actually the polygon's)
            var n = curPoly.plane.normal;
            var norm = new Float32Array([n.x, n.y, n.z, 0]);
            gl.uniform4fv(uNormal, norm);

            // Solid
            gl.uniform4fv(uColor, flatten(curPoly.color));
            gl.drawArrays(
                    gl.TRIANGLE_FAN,
                    curMesh.offsets[j],
                    curMesh.lengths[j]
                    );

            // Wireframe
            if (renderMode === 0) {
                if (curMesh === selected) {
                    gl.uniform4fv(uColor, selectedColor);
                } else {
                    gl.uniform4fv(uColor, wireColor);
                }
                gl.drawArrays(
                        gl.LINE_LOOP,
                        curMesh.offsets[j],
                        curMesh.lengths[j]
                        );
            }
        }
    }

    // If we were doing a pick, figure out what was selected and pick it, then
    // rebind the default buffer for normal rendering.
    if (renderMode === 1) {
        var rect = canvas.getBoundingClientRect();
        var screenX = clickEvent.clientX - rect.left;
        var screenY = canvas.height - (clickEvent.clientY - rect.top);
        var color = new Uint8Array(4);
        gl.readPixels(screenX, screenY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, color);
        getPickedMesh(color[0]);
        console.log(color[0]);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    // Only re-render if we are doing normal rendering.
    if (renderMode === 0) requestAnimFrame(render);
}

/**
 * Attaches event handlers for HTML5 elements and interactions.
 */
function AttachEventHandlers() {
    canvas.onmousedown = handleMouseDown;
    canvas.onclick = handlePickClick;
    document.onmouseup = handleMouseUp;
    document.onmousemove = handleMouseMove;

    // Create buttons
    document.getElementById("cubeButton").onmousedown = createCube;
    document.getElementById("sphereButton").onmousedown = createSphere;
    document.getElementById("cylinderButton").onmousedown = createCylinder;
    document.getElementById("coneButton").onmousedown = createCone;

    // Interaction controls
    document.getElementById("transX").onchange = onFieldChange;
    document.getElementById("transXSlider").oninput = onSliderChange;
    document.getElementById("transY").onchange = onFieldChange;
    document.getElementById("transYSlider").oninput = onSliderChange;
    document.getElementById("transZ").onchange = onFieldChange;
    document.getElementById("transZSlider").oninput = onSliderChange;
    document.getElementById("scaleX").onchange = onFieldChange;
    document.getElementById("scaleXSlider").oninput = onSliderChange;
    document.getElementById("scaleY").onchange = onFieldChange;
    document.getElementById("scaleYSlider").oninput = onSliderChange;
    document.getElementById("scaleZ").onchange = onFieldChange;
    document.getElementById("scaleZSlider").oninput = onSliderChange;
    document.getElementById("rotX").onchange = onFieldChange;
    document.getElementById("rotXSlider").oninput = onSliderChange;
    document.getElementById("rotY").onchange = onFieldChange;
    document.getElementById("rotYSlider").oninput = onSliderChange;
    document.getElementById("rotZ").onchange = onFieldChange;
    document.getElementById("rotZSlider").oninput = onSliderChange;
    document.getElementById("sceneList").onchange = function(event) {
        selected = event.srcElement.selectedOptions[0].mesh;
        updateControls(selected);
    };
    document.getElementById("geo1SetButton").onclick = function(event) {
        boolGeo1 = selected;
        document.getElementById("geo1Field").value =
                selected ? selected.name : null;
    };
    document.getElementById("geo2SetButton").onclick = function(event) {
        boolGeo2 = selected;
        document.getElementById("geo2Field").value =
                selected ? selected.name : null;
    };

    // Other Buttons
    document.getElementById("colorButton").onmousedown = function(event) {
        var r = document.getElementById("colR").value;
        var g = document.getElementById("colG").value;
        var b = document.getElementById("colB").value;
        var a = document.getElementById("colA").value;
        selected.geometry.setColor([r, g, b, a]);
    };

    document.getElementById("deleteButton").onmousedown = deleteMesh;
    document.getElementById("copyButton").onmousedown = createCopy;

    // Boolean Buttons
    document.getElementById("unionButton").onmousedown = function() {
        var newGeo = createBooleanGeometry(boolGeo1, boolGeo2, BSPNode.Union);
        boolGeo1 = newGeo;
        boolGeo2 = null;
        document.getElementById("geo1Field").value = boolGeo1.name;
        document.getElementById("geo2Field").value = null;
    };
    document.getElementById("intersectButton").onmousedown = function() {
        var newGeo = createBooleanGeometry(boolGeo1, boolGeo2, BSPNode.Intersect);
        boolGeo1 = newGeo;
        boolGeo2 = null;
        document.getElementById("geo1Field").value = boolGeo1.name;
        document.getElementById("geo2Field").value = null;
    };
    document.getElementById("subtractButton").onmousedown = function() {
        var newGeo = createBooleanGeometry(boolGeo1, boolGeo2, BSPNode.Subtract);
        boolGeo1 = newGeo;
        boolGeo2 = null;
        document.getElementById("geo1Field").value = boolGeo1.name;
        document.getElementById("geo2Field").value = null;
    };
}

/**
 * Handles left clicks on the canvas element. Renders 1 frame of pick coloring,
 * finds the selected mesh, and puts it in the picked global.
 * @param {type} event
 * @returns {undefined}
 */
function handlePickClick(event) {
    render(null, 1, event);
    selected = picked;
    updateControls(picked);
}

/**
 * Picks a mesh based on id.
 * @param {int} id The ID of the mesh to pick (also its pick color)
 */
function getPickedMesh(id) {
    for (var i = 0; i < meshes.length; i++) {
        if (meshes[i].id === id) {
            picked = meshes[i];
            return;
        }
    }
}

//*************************************************
// SCENE OBJECT CREATION EVENTS
//*************************************************

var MeshIDs = 0;

function createCube(event) {
    var mesh = new Mesh(gl, Cube(null, null, null, vec4(0, 0.25, 1, 1)));
    mesh.name = "Cube " + MeshIDs++;
    mesh.id = MeshIDs;
    createEvent(mesh);
}

function createSphere(event) {
    var mesh = new Mesh(gl, Sphere(null, null, null, vec4(1, 0.5, 0, 1)));
    mesh.name = "Sphere " + MeshIDs++;
    mesh.id = MeshIDs;
    createEvent(mesh);
}

function createCylinder(event) {
    var mesh = new Mesh(gl, Cylinder(null, null, null, vec4(0.75, 0, 0.75, 1)));
    mesh.name = "Cylinder" + MeshIDs++;
    mesh.id = MeshIDs;
    createEvent(mesh);
}

function createCone(event) {
    var mesh = new Mesh(gl, Cone(null, null, null, vec4(0, 1, 0, 1)));
    mesh.name = "Cone" + MeshIDs++;
    mesh.id = MeshIDs;
    createEvent(mesh);
}

function createBooleanGeometry(mesh1, mesh2, operation) {
    var mesh = new Mesh(gl, operation(
            mesh1.geometry.transformedGeometry(),
            mesh2.geometry.transformedGeometry()));

    mesh.name = "Geometry " + MeshIDs++;
    mesh.id = MeshIDs;
    deleteMesh(null, mesh1);
    deleteMesh(null, mesh2);
    createEvent(mesh);
    return mesh;
}

function createCopy(event) {
    var mesh = selected.clone(gl);
    mesh.name = "Geometry " + MeshIDs++;
    mesh.id = MeshIDs;
    createEvent(mesh);
}

/**
 * Does postprocessing necessary to sync the program with the new object.
 * @param {Mesh} mesh The new mesh.
 */
function createEvent(mesh) {
    meshes.push(mesh);

    // Create a new option for the scene list.
    var option = document.createElement("option");
    option.text = mesh.name;
    option.id = mesh.name;
    option.mesh = mesh;

    // Add the new option and select it immediately.
    var list = document.getElementById("sceneList");
    list.add(option);
    list.selectedIndex = list.length - 1;

    // Select the mesh in the scene and synchronize the controls.
    selected = mesh;
    updateControls(selected);
}

function deleteMesh(event, mesh) {
    if (!mesh) {
        if (!selected) {
            return;
        } else {
            mesh = selected;
        }
    }

    // Remove the mesh from the scene.
    var index = meshes.indexOf(mesh);
    meshes.splice(index, 1);

    // Remove the mesh from the list.
    var list = document.getElementById("sceneList");
    for (var i = 0; i < list.childNodes.length; i++) {
        if (list.childNodes[i].id === mesh.name) {
            list.remove(i);
            break;
        }
    }

    selected = null;
}

//*************************************************
// HTML INPUT CONTROLS EVENTS
//*************************************************

function onFieldChange(event) {
// Get the value of the complement control and update it.
    var fieldID = event.target.id;
    var sliderID = fieldID + "Slider";
    var value = event.target.value;
    var complement = document.getElementById(sliderID);
    if (complement !== null) complement.value = value;
    // Update the corresponding object's properties.
    updateObject(fieldID, value, selected);
}

function onSliderChange(event) {
// Get the value of the complement control and update it.
    var sliderID = event.target.id;
    var fieldID = sliderID.substring(0, sliderID.length - 6);
    var value = event.target.value;
    document.getElementById(fieldID).value = value;
    // Update the corresponding object's properties.
    updateObject(sliderID, value, selected);
}

//*************************************************
// OBJECT / CONTROL UPDATE FUNCTIONS
//*************************************************

/**
 * Updates the selected object given a changed control.
 * 
 * @param {string} inputID The id of the control that changed.
 * @param {number} value The value of that control.
 * @param {Mesh} mesh The mesh to update.
 */
function updateObject(inputID, value, mesh) {
    if (!mesh) return;
    var geo = mesh.geometry;

    switch (inputID) {
        case "transX":
        case "transXSlider":
            geo.pos[0] = value;
            break;
        case "transY":
        case "transYSlider":
            geo.pos[1] = value;
            break;
        case "transZ":
        case "transZSlider":
            geo.pos[2] = value;
            break;
        case "scaleX":
        case "scaleXSlider":
            geo.scale[0] = value;
            break;
        case "scaleY":
        case "scaleYSlider":
            geo.scale[1] = value;
            break;
        case "scaleZ":
        case "scaleZSlider":
            geo.scale[2] = value;
            break;
        case "rotX":
        case "rotXSlider":
            geo.rot[0] = deg2rad(value);
            break;
        case "rotY":
        case "rotYSlider":
            geo.rot[1] = deg2rad(value);
            break;
        case "rotZ":
        case "rotZSlider":
            geo.rot[2] = deg2rad(value);
            break;
        case "colR":
            geo.color[0] = value;
            break;
        case "colG":
            geo.color[1] = value;
            break;
        case "colB":
            geo.color[2] = value;
            break;
        case "colA":
            geo.color[3] = value;
            break;
    }

    // Update the instance matrices to reflect the changes.
    geo.updateTransforms();
}

/**
 * Updates the user controls with the values of the mesh.
 * 
 * @param {Mesh} mesh The mesh to update against.
 */
function updateControls(mesh) {
    if (!mesh) return;

    var geo = mesh.geometry;

    // Update the scene list in case the update was caused by a pick.
    var list = document.getElementById("sceneList");
    for (var i = 0; i < list.childNodes.length; i++) {
        if (list.childNodes[i].id === mesh.name) {
            list.selectedIndex = i;
            break;
        }
    }

    // Translation
    document.getElementById("transX").value = geo.pos[0];
    document.getElementById("transY").value = geo.pos[1];
    document.getElementById("transZ").value = geo.pos[2];
    document.getElementById("transXSlider").value = geo.pos[0];
    document.getElementById("transYSlider").value = geo.pos[1];
    document.getElementById("transZSlider").value = geo.pos[2];

    // Scale
    document.getElementById("scaleX").value = geo.scale[0];
    document.getElementById("scaleY").value = geo.scale[1];
    document.getElementById("scaleZ").value = geo.scale[2];
    document.getElementById("scaleXSlider").value = geo.scale[0];
    document.getElementById("scaleYSlider").value = geo.scale[1];
    document.getElementById("scaleZSlider").value = geo.scale[2];

    // Rotation
    document.getElementById("rotX").value = rad2deg(geo.rot[0]);
    document.getElementById("rotY").value = rad2deg(geo.rot[1]);
    document.getElementById("rotZ").value = rad2deg(geo.rot[2]);
    document.getElementById("rotXSlider").value = rad2deg(geo.rot[0]);
    document.getElementById("rotYSlider").value = rad2deg(geo.rot[1]);
    document.getElementById("rotZSlider").value = rad2deg(geo.rot[2]);
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

function rad2deg(rad) {
    return rad * (360 / (2 * Math.PI));
}