/**
 * Represents a vector in 3-space.
 * @constructor
 */
function Vector(x, y, z) {
    if (x.length === 3) {
        this.x = x[0];
        this.y = x[1];
        this.z = x[2];
    } else {
        this.x = x;
        this.y = y;
        this.z = z;
    }
}

Vector.prototype = {
    plus: function(other) {
        return new Vector(this.x + other.x, this.y + other.y, this.z + other.z);
    },
    minus: function(other) {
        return new Vector(this.x - other.x, this.y - other.y, this.z - other.z);
    },
    times: function(t) {
        return new Vector(this.x * t, this.y * t, this.z * t);
    },
    divide: function(t) {
        return new Vector(this.x / t, this.y / t, this.z / t);
    },
    dot: function(other) {
        return this.x * other.x + this.y * other.y + this.z * other.z;
    },
    cross: function(other) {
        return new Vector(
                this.y * other.z - this.z * other.y,
                this.z * other.x - this.x * other.z,
                this.x * other.y - this.y * other.x
                );
    },
    magnitude: function() {
        // m^2 = x^2 + y^2 + z^2
        return Math.sqrt(this.dot(this));
    },
    flip: function() {
        return this.times(-1);
    },
    unit: function() {
        return this.divide(this.magnitude());
    },
    lerp: function(other, t) {
        // lerp = (1-t)*u + t*v
        return this.times(1 - t).plus(other.times(t));
    },
    clone: function() {
        return new Vector(this.x, this.y, this.z);
    }
};

/**
 * Represents a plane.
 * 
 * The plane is represented in a format called Hessian Normal Form. This form is
 * described by a unit normal vector from the origin, and a distance p at which
 * the normal would intersect the plane. This form has two very useful
 * properties. The first is the equation:
 *     n.dot(x) = -p
 * where x is any point in a plane with unit normal vector n. p is the distance
 * from the origin to this plane, and its sign determines on which side of the
 * plane the origin lies - negative means the origin lies behind the plane,
 * while positive means it lies in front of the plane (or in the direction of
 * the normal vector. Using this property, we also have:
 *     n.dot(x0) + p = d
 * where x0 is an arbitrary point, and d is the distance from that point to this
 * plane. This easy calculation allows us to decide which side of a plane an
 * arbitrary point lies on very easily by looking at the magnitude of d.
 * For more information:
 * http://mathworld.wolfram.com/HessianNormalForm.html
 * http://mathworld.wolfram.com/Plane.html
 * 
 * @param {Vector} normal A UNIT normal at the origin.
 * @param {number} p A distance from the origin.
 * @returns {Plane} A plane in Hessian Normal Form.
 */
function Plane(normal, p) {
    this.normal = normal;
    this.p = p;
}

/**
 * Generates a plane from a triangle's vertices.
 * 
 * Generates two vectors from the supplied points and take their cross-product
 * to get an orthogonal vector. Make it unit length, and you have a unit normal
 * vector of the plane the triangle lies in. As described above in the
 * description of Hessian Normal Form, using an arbitrary point in a plane and
 * its unit normal, we can find its distance to the origin, and thus we can
 * construct a new plane in Hessian Normal Form.
 * 
 * Note: These vertices should be in their winding order (counter-clockwise)!
 * 
 * @param {Vector} a Vertex of a triangle.
 * @param {Vector} b Vertex of a triangle, counter-clockwise from a.
 * @param {Vector} c Vertex of a triangle, counter-clockwise from b.
 * @returns {Plane} A new plane from the supplied triangle's vertices.
 */
Plane.ofTriangle = function(a, b, c) {
    var u = a.minus(b);
    var v = c.minus(b);
    var normal = v.cross(u).unit();
    var p = -normal.dot(a);
    return new Plane(normal, p);
};

Plane.prototype = {
    flip: function() {
        return new Plane(this.normal.flip(), -this.p);
    },
    clone: function() {
        return new Plane(this.normal, this.p);
    },
    /**
     * Bisect a polygon along this plane.
     * 
     * The polygon is bisected, and new (sub) polygons formed by the bisection
     * are returned, categorized into lists based on whether the new polgyons
     * lie in front of this plane, behind this plane, or on the plane facing the
     * same direction or the reverse direction.
     * 
     * @param {Polygon} polygon The polygon to bisect.
     * @param {Polygon[]} front Returned polygons in front of this plane.
     * @param {Polygon[]} samePlane Returned polygons in the same plane.
     * @param {Polygon[]} behind Returned polygons behind this plane.
     * @param {Polygon[]} reversePlane Returned polygons in the same plane, but
     * in the opposite direction.
     */
    bisect: function(polygon, front, samePlane, behind, reversePlane) {
        // Figure out where each vertex of the polygon being bisected lies with
        // respect to the bisecting plane (in front of it, behind it, or
        // coplanar). This will allow us to determine if a given pair of
        // vertices in the polygon intersects this plane (and subsequently
        // requires bisection).
        var location = [];
        for (var i = 0; i < polygon.vertices.length; i++) {
            // Calculating the distance of the vertex to the bisecting plane
            // effectively gives us whether the vertex is in front of or behind
            // the plane by examining the sign of the distance. Calculating this
            // distance is easy because the plane is in Hessian Normal Form:
            //     n.dot(v) + p = d
            var v = polygon.vertices[i];
            var d = this.normal.dot(v) + this.p;

            // If the d value is positive, the vertex is in front of the plane,
            // if negative, behind the plane, and if 0, it is coplanar. Due to
            // numerical inaccuracy, it is very unlikely that the d value for a
            // coplanar vertex will land exactly on 0, so check if the d value
            // lies within some delta of 0 for coplanarity.
            if (d > 1e-5) {
                location.push("front");
            } else if (d < -1e-5) {
                location.push("back");
            } else {
                location.push("plane");
            }

        }

        // One special case - all vertices could be coplanar. If that is the
        // case, we simply return the whole polygon in the correct bucket.
        var isCoplanar = location.reduce(function(acc, x) {
            return acc && x === "plane";
        }, true);
        if (isCoplanar) {
            if (this.normal.dot(polygon.plane.normal) > 0) {
                samePlane.push(polygon);
                return;
            } else {
                reversePlane.push(polygon);
                return;
            }
        }

        // Now we sort the vertices into their appropriate buckets as
        // defined in the parameters of this function. The big catch here is
        // that bisected polygons need to be reformed on both sides of the
        // bisecting plane - just forming a new polygon from individual
        // vertices that landed on one side of the plane would produce some
        // strange-looking geometry.
        //
        // What we do here travel around the vertices of the polygon,
        // examining two at a time. If the two vertices are on the same side
        // of the bisecting plane, then we're fine, they both just go into
        // the appropriate bucket. When the vertices are on different sides
        // of the plane, however, we need to create two new vertices that
        // are coplanar with the bisecting plane that form the "cut-off"
        // portion of the two new polygons. Doing this for every vertex in
        // the polygon will form two polygons with a flat face right up
        // against the bisecting plane on either side.
        var newFront = [];
        var newBack = [];
        for (var i = 0; i < polygon.vertices.length; i++) {
            // Get the current vertex, and the next vertex in the list,
            // modulo the length of the list so that we wrap around back to
            // the first vertex. Get their locations as well, so we can can
            // decide on where to put them and if we need to bisect.
            var vert1 = polygon.vertices[i];
            var loc1 = location[i];
            var vert2 = polygon.vertices[(i + 1) % polygon.vertices.length];
            var loc2 = location[(i + 1) % polygon.vertices.length];

            if (loc1 === "front") {
                newFront.push(vert1);
            } else if (loc1 === "back") {
                newBack.push(vert1);
            } else {
                newFront.push(vert1);
                newBack.push(vert1.clone());
            }

            if (loc1 !== loc2 && loc1 !== "plane" && loc2 !== "plane") {
                // Ray-Plane intersection to find point on bisecting plane
                // between the two bisected vertices.
                // t = -(P0 dot N + p) / (V dot N)
                var V = vert2.minus(vert1);
                var t = -(vert1.dot(this.normal) + this.p) / V.dot(this.normal);

                // Create 2 new points at the intersection we just found -
                // one for the front and one for the back. This basically
                // cuts off the polygon on both sides of the bisecting plane
                // and gives us a vertex to use for the flat face.
                var bisectPoint = vert1.lerp(vert2, t);
                newFront.push(bisectPoint);
                newBack.push(bisectPoint.clone());
            }
        }

        // Return the new polygon(s) to their appropriate bucket. Important
        // caveat here: in the case that we had a polygon with one face that
        // was coplanar with the bisecting plane, we will end up with two
        // vertices in either the front/back bucket, and the rest in the
        // oposite bucket. This occurs because of the cloning of vertices
        // that happens when coplanar points are encountered. Simply check
        // that a full polygon has been formed on a given side before
        // returning it to deal with this edge case.
        // NOTE: Make sure to return a *polygon*, not a bunch of verts!
        if (newFront.length >= 3) {
            front.push(new Polygon(newFront, polygon.color));
        }
        if (newBack.length >= 3) {
            behind.push(new Polygon(newBack, polygon.color));
        }
    }
};

/**
 * Represents a convex polygon in 3-space.
 * 
 * A polygon must be convex and planar, so the array of vertices must:
 *     1) have at least 3 vertices.
 *     2) form a convex loop.
 *     3) have only coplanar vertices (all lie on a common plane).
 * 
 * The winding order of the first three vertices supplied will determine the
 * direction of the normal for this polygon (stored in this polygon's plane).
 * 
 * @param {Vector[]} vertices
 * @param {vec4} color
 * @returns {Polygon} A new convex, planar polygon.
 */
function Polygon(vertices, color) {
    this.vertices = vertices;
    this.color = color;
    this.plane = Plane.ofTriangle(vertices[0], vertices[1], vertices[2]);
}

Polygon.prototype = {
    flip: function() {
        var copy = this.clone();

        // Reverse the order of the vertices to flip the winding order.
        copy.vertices.reverse();
        copy.plane = copy.plane.flip();
        
        return copy;
    },
    clone: function() {
        return new Polygon(this.vertices.map(function(vertex) {
            return vertex.clone();
        }), this.color);
    }
};