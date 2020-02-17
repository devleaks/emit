const geojson = require('./geojson-util')

const NAUTICAL_MILE = 1.852 // nautical mile in meters

exports.to_kmh = function(kn) {
    return kn * NAUTICAL_MILE
}

exports.to_kn = function(km) {
    return kmh / NAUTICAL_MILE
}


exports.Device = function(name, props) {
    this._track = [] // array of coordinates for LineString
    this._points = [] // feature collection of Points
    this._speeds = [] // {idx: 1, speed: 60}
    this._pauses = [] // {idx: 1, pause: 60}

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

        if (false) {
            this._points.push(geojson.Feature(geojson.Point(pcoord), {
                "addPointToTrack": true,
                "idx": c
            }))
        }

        if (speed)
            this._speeds.push({ "idx": c, "speed": speed })

        if (pause && pause > 0)
            this._pauses.push({ "idx": c, "pause": pause })
    }

    // marker Point are features with a property "note"
    this.addMarker = function(point, speed, pause, note, color = "#aaaaaa") { // point = [lon, lat]
        const c = this._track.length - 1
        if (geojson.isFeature(point)) {
            point.properties = point.properties ? point.properties : {}
            point.properties["marker"] = true // signal we wrote this
            point.properties["idx"] = c // we're around that point in the LineString track
            point.properties["speed"] = speed
            point.properties["pause"] = pause
            point.properties["note"] = note
            point.properties["marker-color"] = color
            point.properties["marker-size"] = "medium"
            point.properties["marker-symbol"] = ""
            this._points.push(point)
        } else {
            this._points.push(geojson.Feature(
                geojson.isGeom(point) ? point : geojson.Point(point), {
                    "marker": true, // signal we wrote this
                    "idx": c,
                    "speed": speed,
                    "pause": pause,
                    "note": note,
                    "marker-color": color,
                    "marker-size": "medium",
                    "marker-symbol": ""
                }))
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
        return geojson.Feature(
            geojson.LineString(this._track), {
                "name": this._name,
                "speedsAtVertices": this._speeds,
                "pausesAtVertices": this._pauses,
                "stroke": color ? color : (l_color ? l_color : "#dddddd"),
                "stroke-width": 2,
                "stroke-opacity": 1
            })
    }


    this.getFeatures = function(add_points = false) {
        var features = []
        features.push(this.getFeature("#dd0000"))
        if (add_points && this._points.length > 0) {
            features = features.concat(this._points)
        }

        return features
    }
}