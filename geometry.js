/**
 * Represents a closed, convex piece of geometry, suitable for a BSP tree.
 * If values are not supplied for instance data, defaults will be used that put
 * the geometry at the origin, unscaled and unrotated.
 * 
 * @param {Polygon[]} polygons The polygons that comprise this geometry.
 * @param {vec3} pos The position of this geometry.
 * @param {vec3} scl The scale of this geometry.
 * @param {vec3} rot The rotation of this geometry.
 */
function Geometry(polygons, pos, scl, rot) {
    this.polygons = polygons;
    this.pos = pos || new vec3(0, 0, 0);
    this.scale = scl || new vec3(1, 1, 1);
    this.rot = rot || new vec3(0, 0, 0);
    this.instance = null;
    this.normalMatrix = null;
    this.updateTransforms();
}

Geometry.prototype = {
    setColor: function(color) {
        this.polygons.forEach(function(poly) {
            poly.color = color;
        });
    },
    clone: function() {
        var polys = this.polygons.map(function(p) {
            return p.clone();
        });
        var pos = vec3(this.pos);
        var scl = vec3(this.scale);
        var rot = vec3(this.rot);
        return new Geometry(polys, pos, scl, rot);
    },
    /**
     * Update the instance and normalMatrix transformation matrices to use the
     * current position, rotation, and scale vectors.
     */
    updateTransforms: function() {
        this.instance = instanceMatrix(this.pos, this.scale, this.rot);
        this.normalMatrix = transpose(inverse(this.instance));
    },
    /**
     * Returns a transformed version of this geometry.
     * @returns {Polygon[]} Geometry transformed by its instance matrix.
     */
    transformedGeometry: function() {
        // Oh god what have I created
        var instance = this.instance;
        return new Geometry(this.polygons.map(function(p) {
            return new Polygon(p.vertices.map(function(v) {
                var vec = new vec4(v.x, v.y, v.z, 1);
                var tVec = matrixVectorProduct(instance, vec);
                return new Vector(tVec[0], tVec[1], tVec[2], 1);
            }), p.color);
        }));
    }
};

/**
 * Creates a Geometry object representing a cube centered at the origin with
 * side length 2.
 * 
 * @param {vec3} pos The position of this geometry.
 * @param {vec3} scl The scale of this geometry.
 * @param {vec3} rot The rotation of this geometry.
 * @param {vec4} color The color of this geometry.
 * @returns {Geometry} A geometry object representing a cube.
 */
function Cube(pos, scl, rot, color) {
    var verts = [
        [-1, 1, 1], [-1, -1, 1], [1, -1, 1], [1, 1, 1],
        [-1, 1, -1], [1, 1, -1], [1, -1, -1], [-1, -1, -1]
    ];

    var indices = [
        [0, 1, 2, 3], [0, 3, 5, 4], [3, 2, 6, 5],
        [0, 4, 7, 1], [2, 1, 7, 6], [4, 5, 6, 7]
    ];

    var polys = indices.map(function(i) {
        return new Polygon([
            new Vector(verts[i[0]]),
            new Vector(verts[i[1]]),
            new Vector(verts[i[2]]),
            new Vector(verts[i[3]])
        ], color);
    });

    return new Geometry(polys, pos, scl, rot);
}


/**
 * Creates a Geometry object representing a sphere centered at the origin with a
 * radius of 1.
 * 
 * @param {vec3} pos The position of this geometry.
 * @param {vec3} scl The scale of this geometry.
 * @param {vec3} rot The rotation of this geometry.
 * @param {vec4} color The color of this geometry.
 * @returns {Geometry} A geometry object representing a sphere.
 */
function Sphere(pos, scl, rot, color) {
    var verts = [];
    var polys = [];
    for (var i = 0; i < 16; i++) {
        for (var j = 0; j < 8; j++) {
            // Clear out the array for a new triangle or square.
            verts = [];

            // First vertex at specified lat/long.
            verts.push(Sphere.Trace(i / 16, j / 8));

            // These two are generated based on whether we are at one of the
            // poles or not. If we are at a pole, instead of generating a
            // square, we just get a triangle.
            if (j > 0) verts.push(Sphere.Trace((i + 1) / 16, j / 8));
            if (j < 7) verts.push(Sphere.Trace((i + 1) / 16, (j + 1) / 8));

            // Closing vertex for square or triangle.
            verts.push(Sphere.Trace(i / 16, (j + 1) / 8));

            polys.push(new Polygon(verts, color));
        }
    }

    return new Geometry(polys, pos, scl, rot);
}

/**
 * Helper function for generating spheres. This function "traces" a vertex along
 * the outside of a sphere with radius 1.
 * 
 * @param {type} longitude Fractional value indicating which line of longitude
 * this vertex should lie on. 0 would indicate the east half of the sphere's
 * prime meridian, and proceeds counterclockwise.
 * @param {type} lattitude Fractional value indicating which line of lattitude
 * this vertex should lie on. 0 would indicate the south pole of the sphere.
 * @returns {Vector} The vertex at the intersection of longitude and lattitude.
 */
Sphere.Trace = function(longitude, lattitude) {
    var theta = longitude * 2 * Math.PI;
    var phi = lattitude * Math.PI;

    // Polar-to-Cartesian conversion.
    return new Vector(
            Math.cos(theta) * Math.sin(phi),
            Math.cos(phi),
            Math.sin(theta) * Math.sin(phi)
            );
};

function Cylinder(pos, scl, rot, color) {
    var verts = [];
    for (var i = 0; i < 16; i++) {
        verts.push(Cylinder.Trace(i / 16, -1));
        verts.push(Cylinder.Trace(i / 16, 1));
    }
    verts.push(new Vector(0, 1, 0));
    verts.push(new Vector(0, -1, 0));

    var indices = [];
    for (var i = 0; i < 32; i += 2) {
        indices.push([i, i + 1, (i + 3) % 32, (i + 2) % 32]);
        indices.push([32, (i + 3) % 32, i + 1]);
        indices.push([33, i, (i + 2) % 32]);
    }

    var polys = indices.map(function(i) {
        return new Polygon(i.map(function(j) {
            return verts[j].clone();
        }), color);
    });

    return new Geometry(polys, pos, scl, rot);

}

Cylinder.Trace = function(longitude, h) {
    var theta = longitude * 2 * Math.PI;

    // Polar-to-Cartesian conversion.
    return new Vector(
            Math.cos(theta),
            h,
            Math.sin(theta)
            );
};

function Cone(pos, scl, rot, color) {
    var verts = [];
    for (var i = 0; i < 16; i++) {
        verts.push(Cylinder.Trace(i / 16, -1));
    }
    verts.push(new Vector(0, 1, 0));
    verts.push(new Vector(0, -1, 0));

    var indices = [];
    for (var i = 0; i < 16; i++) {
        indices.push([(i + 1) % 16, i, 16]);
        indices.push([17, i, (i + 1) % 16]);
    }

    var polys = indices.map(function(i) {
        return new Polygon(i.map(function(j) {
            return verts[j].clone();
        }), color);
    });

    return new Geometry(polys, pos, scl, rot);
}

/**
 * Wrapper object for Geometries that installs the vertex data into the GPU and
 * provides helpful fields for rendering the Geometry.
 * 
 * @param {WebGLRenderingContext} gl The WebGL context.
 * @param {Geometry} geo The Geometry.
 * @returns {Mesh} Mesh objecting wrapping the supplied Geometry object.
 */
function Mesh(gl, geo) {
    this.geometry = geo;
    this.vbo = gl.createBuffer();
    this.name = null;
    this.id = null;

    // Number of vertices in each polygon.
    this.lengths = geo.polygons.map(function(poly) {
        return poly.vertices.length;
    });

    // Index of each polygon in the vbo.
    this.offsets = this.lengths.reduce(function(acc, x) {
        return acc.concat([acc.slice(-1)[0] + x]);
    }, [0]);

    // Build the vertex buffer
    var verts = flatten(geo.polygons.reduce(function(acc, x) {
        return acc.concat(x.vertices.map(function(v) {
            return new vec4(v.x, v.y, v.z, 1);
        }));
    }, []));
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
}

Mesh.prototype = {
    clone: function(gl) {
        return new Mesh(gl, this.geometry.clone());
    }
};