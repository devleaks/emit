import parse from "csv-parse/lib/sync.js";
import * as debug from "./debug.js";
import { jitter } from "./emit-lib.js";

/* Templates of what is expected by gip-mapjs
{
    "type": "Feature",
    "properties": {
        "name": "SN123",
        "name": "Brussel-Madrid",
        "typeId": "AIRCRAFT",
        "display_type": "Aircraft",
        "display_status": "GROUND",
        "heading": 138,
        "speed": 4,
        "group_name": "AIRCRAFT",
        "group_display_name": "Aircrafts",
        "status": "ACTIVE",
        "_style": {
            "markerColor": "rgb(0,255,0)",
            "weight": 1,
            "opacity": 0.8,
            "fillColor": "rgb(0,255,0)",
            "fillOpacity": 0.4,
            "markerSymbol": "plane",
            "markerRotationOffset": -45
        },
        "_templates": {
            formatDate: function() {
                return function(text, render) {
                    return Date(parseInt(render(text)) * 1000);
                }
            },
            "show_label": true,
            "tooltip": "{{feature.properties.name}}",
            "popup": "{{feature.properties.name}} is {{feature.properties.display_status}} / {{feature.properties.status}}",
            "sidebar": "{{feature.properties.name}} is {{feature.properties.display_status}} / {{feature.properties.status}}.<br/>" +
                "Last seen at formated date: {{#templates.formatDate}}" +
                "{{feature.properties._timestamp}}" +
                "{{/templates.formatDate}}.<br/>" +
                "Available {{&texts.linkURL}}.",
            "linkText": "Link to {{feature.properties.name}}",
            "linkURL": "<a href='#path-to-get-more-details?id={{feature.properties.name}}'>{{texts.linkText}}</a>" // !
        }
    },
    "geometry": {
        "type": "Point",
        "coordinates": [
            5.437524318695068,
            50.634546465964206
        ]
    }
}
*/

function stripquotes(str, q = "'") {
    return (str.substr(0, 1) == q && str.substr(-1, 1) == q) ?
        str.substr(1, str.length - 2) :
        str
}

function upperFirst(str) {
    return str.substr(0, 1).toUpperCase() + str.slice(1).toLowerCase()
}

// csv ready for kafka can have many forms...
function preparsecsv(csv) {
    var obj = {}
    var arr = csv.split(",")
    obj.queue = arr.shift()
    obj.name = arr.shift()
    obj.timestamp = arr.shift()
    var rest = arr.join(",") // rest of message varies...
    obj.payload = stripquotes(rest)
    return obj
}

export const getDateTime = function(csv) {
    let r = convert(csv)
    let r1 = Array.isArray(r) ? r[0] : r
    if (r1.hasOwnProperty("timestamp")) {
        return r1.timestamp
    }
    return ""
};

export const convert = function(csv) {
    var ret = false
    var objcsv = preparsecsv(csv)

    switch (objcsv.queue) {
        case "aircraft":
            /* { payload
                  queue: "aircraft",
                  name: "568E28",
                  timestamp: "2020-03-23T15:34:08.870+01:00",
                  lat: "50.57171306441866",
                  lon: "5.658800761665411",
                  speed: "333.36",
                  heading: "67.1"
            } */
            var cols = "lat,lon,alt,speed,heading,payload"
            var records = parse(objcsv.payload, { columns: cols.split(","), quote: "'", escape: "'" })
            var payload = records[0]
            let org = null
            /*
            if(payload.hasOwnProperty("payload")) {
                try {
                    let subpayload = JSON.parse(payload.payload)
                    org = subpayload.hasOwnProperty("flight") ? subpayload["flight"].substr(0, 2) : "orgId"
                } catch (e) {
                    console.log("simview", e)
                }
            }
            console.log(">>", org)
            */
            ret = {
                source: "GIPSIM",
                "type": "Feature",
                "properties": {
                    "name": objcsv.name,
                    "typeId": "AIRCRAFT",
                    "classId": "aircrafts",
                    "orgId": org ? org : "GIP", // org owner is flight operator
                    "heading": parseFloat(payload.heading),
                    "speed": parseFloat(payload.speed),
                    "group_name": "AIRCRAFTS",
                    "status": "ACTIVE",
                    "_timestamp_emission": objcsv.timestamp,
                    "_style": {
                        "markerColor": "#00a",
                        "weight": 1,
                        "opacity": 0.8,
                        "fillColor": "rgb(0,0,0)",
                        "fillOpacity": 0.4,
                        "markerSymbol": "plane",
                        "markerRotationOffset": 0
                    },
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [
                        parseFloat(payload.lon),
                        parseFloat(payload.lat)
                    ]
                }
            }
            if (payload.hasOwnProperty("payload")) {
                ret.properties.payload = payload.payload
            }

            ret = {
                source: "GIPSIM",
                type: "map",
                timestamp: objcsv.timestamp,
                payload: ret
            }

            break


        case "truck":
            /* {
                  queue: "truck",
                  name: "T1234",
                  timestamp: "2020-03-23T15:34:08.870+01:00",
                  lat: "50.57171306441866",
                  lon: "5.658800761665411",
                  speed: "333.36",
                  heading: "67.1"
            } */
            var cols = "lat,lon,alt,speed,heading,payload"
            var records = parse(objcsv.payload, { columns: cols.split(","), quote: "'", escape: "'" })
            var payload = records[0]
            ret = {
                source: "GIPSIM",
                "type": "Feature",
                "properties": {
                    "name": objcsv.name,
                    "typeId": "TRUCK",
                    "classId": "trucks",
                    "orgId": "GIP",
                    "heading": parseFloat(payload.heading),
                    "speed": parseFloat(payload.speed),
                    "group_name": "TRUCKS",
                    "status": "ACTIVE",
                    "_style": {
                        "markerColor": "rgb(0,100,0)",
                        "weight": 1,
                        "opacity": 0.8,
                        "fillColor": "rgb(0,0,0)",
                        "fillOpacity": 0.4,
                        "markerSymbol": "truck"
                    },
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [
                        parseFloat(payload.lon),
                        parseFloat(payload.lat)
                    ]
                }
            }

            if (payload.hasOwnProperty("payload")) {
                ret.properties.payload = payload.payload
            }

            ret = {
                source: "GIPSIM",
                type: "map",
                timestamp: objcsv.timestamp,
                payload: ret
            }

            break


        case "service":
            /* {
    
            } */
            var cols = "lat,lon,alt,speed,heading,payload"
            var records = parse(objcsv.payload, { columns: cols.split(","), quote: "'", escape: "'" })
            var payload = records[0]

            var data = false
            if (payload.payload != "") {
                var p = JSON.parse(payload.payload)
                if (objcsv.name.substr(0, 4) == "fuel" && p.hasOwnProperty("capacity") && p.hasOwnProperty("load")) {
                    data = {
                        "type": "donut",
                        "values": [p.capacity - p.load, p.load],
                        "radius": 12,
                        "innerRadius": 8,
                        "fill": ["#00dd00", "#dd0000"]
                    }
                }
            }

            var icon, color
            const sarr = objcsv.name.split(":")
            switch (sarr[0]) {
                case "fuel":
                    icon = "gas-pump"
                    color = "orange"
                    break
                case "sewage":
                    icon = "trash"
                    color = "darkred"
                    break
                case "catering":
                    icon = "utensils"
                    color = "green"
                    break
                case "cargo":
                    icon = "truck-loading"
                    color = "#444444"
                    break
                case "bus":
                case "marshall":
                default:
                    icon = "truck"
                    color = "rgb(128,128,128)"
            }

            ret = {
                source: "GIPSIM",
                "type": "Feature",
                "properties": {
                    "name": objcsv.name,
                    "typeId": "SERVICE", // sarr[0]
                    "classId": "gse",
                    "orgId": "org",
                    "heading": parseFloat(payload.heading),
                    "speed": parseFloat(payload.speed),
                    "group_name": "SERVICES",
                    "status": "ACTIVE",
                    "timestamp": payload.timestamp,
                    "_timestamp_emission": objcsv.timestamp,
                    "_timestamp_payload": payload.timestamp,
                    "_style": {
                        "markerColor": color,
                        "weight": 1,
                        "opacity": 0.8,
                        "fillColor": color,
                        "fillOpacity": 0.4,
                        "markerSymbol": icon,
                        "markerRotationOffset": 0
                    },
                    "_templates": {
                        formatDate: function() {
                            return function(text, render) {
                                return Date(parseInt(render(text)) * 1000);
                            }
                        },
                        "show_label": true,
                        "tooltip": "{{feature.properties.name}}",
                        "popup": "{{feature.properties.name}} is {{feature.properties.status}}",
                        "sidebar": "{{feature.properties.name}} is {{feature.properties.status}}.<br/>" +
                            "Last seen at formated date: {{#templates.formatDate}}" +
                            "{{feature.properties.timestamp}}" +
                            "{{/templates.formatDate}}.<br/>" +
                            "Available {{&texts.linkURL}}.",
                        "linkText": "Link to {{feature.properties.name}}",
                        "linkURL": "<a href='#path-to-get-more-details?id={{feature.properties.name}}'>{{texts.linkText}}</a>" // !
                    }
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [
                        parseFloat(payload.lon),
                        parseFloat(payload.lat)
                    ]
                }
            }

            if (data) {
                ret.properties._data = data
            }

            ret = {
                source: "GIPSIM",
                type: "map",
                timestamp: objcsv.timestamp,
                payload: ret
            }

            break


        case "flightboard": //always a payload
            /* {
                  info: "actual",
                  move: "departure",
                  flight: flight.flight,
                  airport: flight.airport,
                  date: dept.format("DD/MM"),
                  time: dept.format("HH:mm"),
                  parking: flight.parking
            } */
            var payload = JSON.parse(objcsv.payload)
            var move = upperFirst(payload.move)
            var msgtype = payload.info == "planned" ? "ETA" : upperFirst(payload.info)
            var msgcolor = payload.info == "planned" ? "success" :
                payload.info == "scheduled" ? "info" : "accent"

            var ret1 = {
                source: "GIPSIM",
                type: "wire",
                timestamp: objcsv.timestamp,
                payload: {
                    source: "aodb",
                    type: "flightboard",
                    subject: move + " " + payload.flight + (payload.move == "departure" ? " to " : " from ") + payload.airport,
                    body: msgtype + " " + payload.time,
                    created_at: objcsv.timestamp,
                    priority: 2,
                    icon: "la-plane-" + payload.move,
                    "icon-color": msgcolor
                }
            }
            payload.timestamp = objcsv.timestamp
            var ret2 = {
                source: "GIPSIM",
                type: "flightboard",
                timestamp: objcsv.timestamp,
                payload: payload
            }

            ret = [ret1, ret2]

            break


        case "transport": //always a payload
            /* {
                  info: "actual",
                  move: "departure",
                  truck: transport.truck,
                  destination: transport.destination,
                  date: dept.format("DD/MM"),
                  time: dept.format("HH:mm"),
                  parking: transport.parking
            } */
            var payload = JSON.parse(objcsv.payload)

            var move = upperFirst(payload.move)
            var msgtype = payload.info == "planned" ? "ETA" : upperFirst(payload.info)
            var msgcolor = payload.info == "planned" ? "success" :
                payload.info == "scheduled" ? "info" : "accent"

            var ret1 = {
                source: "GIPSIM",
                type: "wire",
                timestamp: objcsv.timestamp,
                payload: {
                    source: "aodb",
                    type: "flightboard",
                    subject: move + " " + payload.truck + (payload.move == "departure" ? " to " : " from ") + payload.destination,
                    body: msgtype + " " + payload.time,
                    created_at: objcsv.timestamp,
                    priority: 2,
                    icon: "la-plane-" + payload.move,
                    "icon-color": msgcolor
                }
            }
            payload.timestamp = objcsv.timestamp
            var ret2 = {
                source: "GIPSIM",
                type: "transport",
                timestamp: objcsv.timestamp,
                payload: payload
            }

            ret = [ret1, ret2]

            break


        case "parking":
            /* {
                  info: "parking",
                  move: "available",
                  flight: flight.flight,
                  airport: flight.airport,
                  parking: flight.parking
            } */
            var payload = JSON.parse(objcsv.payload)
            ret1 = {
                source: "GIPSIM",
                type: "wire",
                timestamp: objcsv.timestamp,
                payload: {
                    source: "aodb",
                    type: "flightboard",
                    subject: "Parking " + payload.parking + " " + payload.move,
                    body: (payload.move == "available" ? "Departure " : "Arrrival ") + " " + payload.flight + (payload.move == "available" ? " to " : " from ") + payload.airport,
                    created_at: objcsv.timestamp,
                    priority: 2,
                    link: "javascript:doit(50.637, 5.453);",
                    icon: "la-parking",
                    "icon-color": (payload.move == "available" ? "success" : "warning")
                }
            }

            ret2 = {
                source: "GIPSIM",
                type: "parking",
                timestamp: objcsv.timestamp,
                payload: {
                    name: payload.parking,
                    available: payload.move,
                    flight: payload.flight
                }
            }

            ret = [ret1, ret2]

            break


        case "metar":
            var payload = JSON.parse(objcsv.payload)
            /* {
                  metar: "raw metar",
                  time: "date time of metar collection"
            } */
            ret = {
                source: "GIPSIM",
                type: "wire",
                timestamp: objcsv.timestamp,
                payload: {
                    source: "aodb",
                    type: "metar",
                    subject: "METAR " + payload.airport + " " + payload.time,
                    body: payload.metar,
                    created_at: objcsv.timestamp,
                    priority: 2,
                    icon: "fa-cloud",
                    "icon-color": "info"
                }
            }

            break


        case "aodb":
            /* Generic AODB message.
             * The emitter's name is the AODB message type.
             * We just "reformat" the payload message.
             */
            // var payload = JSON.parse(objcsv.payload)
            // need to "try to parse" payload to avoid stringifying twice.
            var payload
            if (typeof objcsv.payload == "string" || objcsv.payload instanceof String) {
                try {
                    payload = JSON.parse(objcsv.payload)
                } catch (e) { // not JSON
                    payload = objcsv.payload
                }
            } else {
                payload = data
            }

            ret = {
                source: "GIPSIM",
                type: objcsv.name,
                timestamp: objcsv.timestamp,
                payload: payload
            }

            break


        case "siminfo":
            var records = parse(objcsv.payload, { columns: ["speed", "rate", "delay"], quote: "'", escape: "'" })
            var payload = records[0]

            ret = {
                source: "GIPSIM",
                type: "siminfo",
                timestamp: objcsv.timestamp,
                payload: {
                    timestamp: objcsv.timestamp,
                    speed: payload.speed,
                    rate: payload.rate,
                    delay: payload.delay
                }
            }

            break


        default: // could be "wire"
            ;
            break
    } // end switch

    return ret
};