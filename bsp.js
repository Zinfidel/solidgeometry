/**
 * Represents a node in a binary space partition tree. Each node is defined by
 * a hyperplane that bisects the tree's geometry, and the polygons of the
 * geometry that lie on that hyperplane.
 * 
 * As per classical implementations of the BSP tree, each node points left and
 * right at a front and back node, representing geometry resting in front of or
 * behind the hyperplane that defines this node. Recursively, those nodes
 * bisect the geometry and so forth, until we hit leaves at the bottom that
 * consist of a node with only polygons in the plane, and none elsewhere.
 * 
 * Note that these nodes shouldn't be constructed directly - the Partition
 * function will construct an entire tree from geometry, or will partition new
 * geometry into an already existing tree.
 * 
 * @returns {BSPNode} The root of a BSP Tree.
 */
BSPNode = function() {
    this.hyperPlane = null;
    this.polygons = [];
    this.front = null;
    this.behind = null;
};

/**
 * Partitions geometry into a BSP tree. If the tree supplied already contains
 * geometry, then this function will partition the new geometry into the tree
 * alongside the extant geometry.
 * 
 * @param {Polygon[]} polygons The polygons to partition.
 * @param {BSPNode} tree If supplied, defines an existing tree to add to.
 * @returns {BSPNode} A BSP Tree containing the partitioned geometry.
 */
BSPNode.Partition = function(polygons, tree) {
    // TODO: Is this necessary?
    if (!polygons || !polygons.length) return;

    // If a tree is supplied, us it, otherwise start a new one. Simply use the
    // first plane in the geometries polygons as a partitioning hyperplane.
    var root = tree ? tree : new BSPNode();
    root.hyperPlane = polygons[0].plane.clone();

    // Split the geometry up along the hyperplane. Anything coplanar stays in
    // this node as part of the hyperplane.
    var left = [];
    var right = [];
    polygons.forEach(function(poly) {
        root.hyperPlane.bisect(poly, left, root.polygons, right, root.polygons);
    });

    // Recursively split the rest of the geometry up along remaining polygons.
    if (left.length > 0) {
        if (!root.front) root.front = new BSPNode();
        BSPNode.Partition(left, root.front);
    }
    if (right.length > 0) {
        if (!root.behind) root.behind = new BSPNode();
        BSPNode.Partition(right, root.behind);
    }

    return root;
};

BSPNode.prototype = {
    /**
     * Returns the sum of all polygons partitioned in this tree.
     * @returns {Polygon[]} All polygons partitioned in this tree.
     */
    concatPolys: function() {
        var polys = this.polygons.map(function(poly) {
            return poly;
        });

        // Recursively concatenate each nodes planar polygons.
        if (this.front) polys = polys.concat(this.front.concatPolys());
        if (this.behind) polys = polys.concat(this.behind.concatPolys());

        return polys;
    },
    /**
     * Creates a Geometry object from the sum of polygons in this tree.
     * @returns {Geometry} Combined geometry object from tree polygons.
     */
    toGeometry: function() {
        return new Geometry(this.concatPolys());
    },
    /**
     * Creates a space-inverted copy of this tree.
     * @returns {BSPNode} Inverted tree.
     */
    flip: function() {
        var copy = this.clone();

        // Flip the orientation of the planes
        copy.hyperPlane = copy.hyperPlane.flip();
        copy.polygons = copy.polygons.map(function(poly) {
            return poly.flip();
        });

        // Recursively flip this tree.
        if (copy.front) copy.front = copy.front.flip();
        if (copy.behind) copy.behind = copy.behind.flip();

        // Because the hyperplane was flipped, the notion of front and back
        // have too and need to be swapped.
        var swap = copy.front;
        copy.front = copy.behind;
        copy.behind = swap;

        return copy;
    },
    /**
     * "Trims" or cuts away portions of the supplied polygons that intersect
     * with polygons in this BSP Tree.
     * 
     * @param {Polygon[]} polys Collection of polygons to trim.
     * @returns {Polygon[]} Trimmed polygons.
     */
    trim: function(polys) {
        // TODO: Need a plane check here?
        if (!this.hyperPlane) return polys.map(function(p) {
                return p;
            });

        // Bisect the polygons strictly into two groups, inside or outside of
        // the polygons in this BSP tree. (Note: "Inside" a polygon in this case
        // means behind it. Geometry is constructed such that it's inside is
        // defined by planes' backsides.)
        var inside = [];
        var out = [];
        for (var i = 0; i < polys.length; i++) {
            this.hyperPlane.bisect(polys[i], out, out, inside, inside);
        }

        // Recursively trim the polygons to the rest of the polygons. If we get
        // to a point where the current node doing the trimming does not have
        // a right node, then the polygons that filter out there can be
        // discarded, as they definitely all lie strictly inside the polygons.
        if (this.front) out = this.front.trim(out);
        if (this.behind) {
            inside = this.behind.trim(inside);
        } else {
            inside = []; // Polys are all inside, clear them.
        }

        // Return a combined collection of polygons that survived the trimming.
        // This is counterintuitive, but the reason the inside polygons might
        // make it out is because they can be behind certain polygons, but still
        // remain outside of the space considered "inside" the geometry. This
        // happens especially often in convex geometry.
        return out.concat(inside);
    },
    /**
     * Trims this BSP tree's polygons from the supplied BSP tree's polygons.
     * @param {BSPNode} tree The tree doing the trimming.
     */
    treeTrimSelf: function(tree) {
        this.polygons = tree.trim(this.polygons);
        if (this.front) this.front.treeTrimSelf(tree);
        if (this.behind) this.behind.treeTrimSelf(tree);
    },
    clone: function() {
        var tree = new BSPNode();
        if (this.hyperPlane) tree.hyperPlane = this.hyperPlane.clone();
        if (this.front) tree.front = this.front.clone();
        if (this.behind) tree.behind = this.behind.clone();
        tree.polygons = this.polygons.map(function(poly) {
            return poly.clone();
        });
        return tree;
    }
};

/**
 * Boolean union operation on two binary space partition trees. Works by
 * removing the shared volume in both trees, removing still-remaining duplicate
 * polygons from the second tree (these can occur due to overlapping polygons),
 * then partitioning the second tree into the first for a complete geometry.
 * 
 * @param {Geometry} geo1 The first geometry to join.
 * @param {Geometry} geo2 The second geometry to join.
 * @returns {Geometry} A geometry representing the union of geo1 and geo2.
 */
BSPNode.Union = function(geo1, geo2) {
    var tree1 = BSPNode.Partition(geo1.polygons);
    var tree2 = BSPNode.Partition(geo2.polygons);

    // Remove intersecting volume.
    tree1.treeTrimSelf(tree2);
    tree2.treeTrimSelf(tree1);

    // Remove possible duplicate planes left in tree 2.
    tree2 = tree2.flip();
    tree2.treeTrimSelf(tree1);
    tree2 = tree2.flip();

    // Combine geometry into one tree.
    BSPNode.Partition(tree2.concatPolys(), tree1);

    return tree1.toGeometry();
};

/**
 * Boolean intersection operation on two binary space partition trees. Works
 * by taking advantage of well-known set operation reductions such as
 * De Morgan's Law:
 * 
 * x AND y = NOT (NOT x OR NOT y)
 * 
 * Since we already have union defined, we can just modify it a bit.
 * 
 * @param {Geometry} geo1 The first geometry to intersect.
 * @param {Geometry} geo2 The second geometry to intersect.
 * @returns {Geometry} Geometry representing the intersection of geo1 and geo2.
 */
BSPNode.Intersect = function(geo1, geo2) {
    var tree1 = BSPNode.Partition(geo1.polygons);
    var tree2 = BSPNode.Partition(geo2.polygons);
    // NOT ( )
    tree1 = tree1.flip();
    tree2.treeTrimSelf(tree1);

    // NOT X OR NOT Y
    tree2 = tree2.flip();
    tree1.treeTrimSelf(tree2);
    tree2.treeTrimSelf(tree1);
    BSPNode.Partition(tree2.concatPolys(), tree1);
    tree1 = tree1.flip();

    return tree1.toGeometry();
};

/**
 * Boolean subtraction operation on two binary space partition trees. Works
 * by taking advantage of well-known set operation reductions such as
 * De Morgan's Law:
 * 
 * x - y = NOT (NOT A OR B)
 * 
 * Since we already have union defined, we can just modify it a bit.
 * 
 * @param {Geometry} geo1 The first geometry to intersect.
 * @param {Geometry} geo2 The second geometry to intersect.
 * @returns {Geometry} Geometry representing subtraction of geo2 from geo1.
 */
BSPNode.Subtract = function(geo1, geo2) {
    var tree1 = BSPNode.Partition(geo1.polygons);
    var tree2 = BSPNode.Partition(geo2.polygons);
    tree1 = tree1.flip();
    tree1.treeTrimSelf(tree2);
    tree2.treeTrimSelf(tree1);
    tree2 = tree2.flip();
    tree2.treeTrimSelf(tree1);
    tree2 = tree2.flip();
    BSPNode.Partition(tree2.concatPolys(), tree1);
    tree1 = tree1.flip();

    return tree1.toGeometry();
};