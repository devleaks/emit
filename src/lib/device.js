import * as geojson from "./geojson-util.js";
import * as debug from "./debug.js";

const NAUTICAL_MILE = 1.852 // nautical mile in meters

export const to_kmh = function(kn) {
    return kn * NAUTICAL_MILE
};

export const to_kn = function(km) {
    return kmh / NAUTICAL_MILE
};

debug.init(true, ["addMarker"])

export const Device = function(name, props) {
    this._track = [] // array of coordinates for LineString
    this._points = [] // array of Points
    this._speeds = [] // array of {idx: 1, speed: 60}
    this._pauses = [] // array of {idx: 1, pause: 60}

    this._props = Object.assign({
        position: null,
        speed: null,
        heading: null,
        vspeed: null,
        updated: null
    }, props)

    this._name = name

    this.addPointToTrack = function(point, speed, pause) { // point = [lon, lat]
        const pcoord = geojson.coords(point)

        this._track.push(pcoord)

        const c = this._track.length - 1

        if (speed)
            this._speeds.push({ "idx": c, "speed": speed })

        if (pause && pause > 0)
            this._pauses.push({ "idx": c, "pause": pause })
    }

    // marker Point are features with a property "note"

    this.addMarker = function(name, point, speed, pause, sync = false, color = "#aaaaaa", props = {}) { // point = [lon, lat]
        var properties = geojson.mergeProperties({
            marker: true,
            "marker-name": name,
            idx: this._track.length - 1, // this marker is associated with element idx of the linestring
            speed: speed,
            pause: pause,
            "marker-color": color,
            "marker-size": "medium",
            "marker-symbol": ""
        }, props)

        if (geojson.isFeature(point)) {
            var clone = geojson.cleanCopy(point)
            clone.properties = geojson.mergeProperties(clone.hasOwnProperty("properties") ? clone.properties : {}, properties)
            if (sync !== false && sync != null) {
                clone.properties.sync = sync
            }
            var clone = geojson.removeTemporaryProperties(clone, ["nearestPointOnLine"])
            this._points.push(clone)
        } else {
            if (sync !== false && sync != null) {
                properties.sync = sync
            }
            this._points.push(geojson.Feature(geojson.isGeom(point) ? point : geojson.Point(point), properties))
        }
    }


    this.addPathToTrack = function(path, speed, pause) { // point = [lon, lat]
        var proxy = this
        path.forEach(function(p, idx) {
            proxy.addPointToTrack(p, speed, pause)
        })
    }


    this.getName = function() {
        return this._name
    }

    this.getProp = function(name) {
        return this._props[name]
    }

    this.setProp = function(name, value) {
        this._props[name] = value
    }

    this.getFeature = function(color = false) {
        const l_color = this.getProp("color")
        const movement = this.getProp("movement")
        const handler = this.getProp("handler")
        const operator = this.getProp("operator")
        return this._track.length > 1 ? geojson.Feature(
            geojson.LineString(this._track), {
                "device": this._name,
                "movement": movement ? movement : "nomovement",
                "handler": handler ? handler : "nohandler",
                "operator": operator ? operator : "nooperator",
                "speedsAtVertices": this._speeds,
                "pausesAtVertices": this._pauses,
                "stroke": color ? color : (l_color ? l_color : "#444444"),
                "stroke-width": 2,
                "stroke-opacity": 1
            }) : null
    }


    this.getFeatures = function(add_points = false) {
        var features = []
        const f = this.getFeature()
        if (f)
            features.push(f)
        if (add_points && this._points.length > 0) {
            features = features.concat(this._points)
        }

        return features
    }
};