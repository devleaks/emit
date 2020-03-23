const parse = require('csv-parse/lib/sync')

/* Templates of what is expected by gip-mapjs
{
    "type": "Feature",
    "properties": {
        "name": "SN123",
        "display_name": "Brussel-Madrid",
        "type": "AIRCRAFT",
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
            "markerSymbol": 'plane',
            "markerRotationOffset": -45
        },
        "_templates": {
            formatDate: function() {
                return function(text, render) {
                    return Date(parseInt(render(text)) * 1000);
                }
            },
            "show_label": true,
            "tooltip": "{{feature.properties.display_name}}",
            "popup": "{{feature.properties.display_name}} is {{feature.properties.display_status}} / {{feature.properties.status}}",
            "sidebar": "{{feature.properties.display_name}} is {{feature.properties.display_status}} / {{feature.properties.status}}.<br/>" +
                "Last seen at formated date: {{#templates.formatDate}}" +
                "{{feature.properties._timestamp}}" +
                "{{/templates.formatDate}}.<br/>" +
                "Available {{&texts.linkURL}}.",
            "linkText": "Link to {{feature.properties.display_name}}",
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

function getPayload(csv) {
   var t = csv.substr(csv.lastIndexOf('{'))
   if(t[t.length-1] != "}")
     t = t.slice(0, -1)
   return JSON.parse(t)
}


exports.convert = function(csv) {
    var obj = false
    var arr = csv.split(",")

    switch (arr[0]) {
        case "aircraft":
        /*
{
  queue: 'aircraft',
  name: '568E28',
  timestamp: '2020-03-23T15:34:08.870+01:00',
  lat: '50.57171306441866',
  lon: '5.658800761665411',
  speed: '333.36',
  heading: '67.1'
}        */
            var cols = "queue,name,timestamp,lat,lon,speed,heading"
            if (arr.length > 7)
                cols += ",payload"
            var records = parse(csv, { columns: cols.split(","), quote: "'", relax: false })
            var record = records[0]
            obj = {
                "type": "Feature",
                "properties": {
                    "name": record.name,
                    "type": "AIRCRAFT",
                    "heading": parseFloat(record.heading),
                    "speed": parseFloat(record.speed),
                    "group_name": "AIRCRAFTS",
                    "group_display_name": "Aircrafts",
                    "status": "ACTIVE",
                    "_style": {
                        "markerColor": "rgb(255,0,0)",
                        "weight": 1,
                        "opacity": 0.8,
                        "fillColor": "rgb(0,0,0)",
                        "fillOpacity": 0.4,
                        "markerSymbol": 'plane',
                        "markerRotationOffset": -45
                    },
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [
                        parseFloat(record.lon),
                        parseFloat(record.lat)
                    ]
                }
            }
            break


        case "service":
            var cols = "queue,name,timestamp,lat,lon,speed,heading"
            if (arr.length > 7)
                cols += ",payload"
            var records = parse(csv, { columns: cols.split(","), quote: "'", relax: false })
            var record = records[0]
            obj = {
                "type": "Feature",
                "properties": {
                    "name": record.name,
                    "type": "SERVICE",
                    "heading": parseFloat(record.heading),
                    "speed": parseFloat(record.speed),
                    "group_name": "SERVICES",
                    "group_display_name": "Service vehicles",
                    "status": "ACTIVE",
                    "timestamp": record.timestamp,
                    "_style": {
                        "markerColor": "rgb(0,255,0)",
                        "weight": 1,
                        "opacity": 0.8,
                        "fillColor": "rgb(0,255,0)",
                        "fillOpacity": 0.4,
                        "markerSymbol": 'truck',
                        "markerRotationOffset": 0
                    },
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [
                        parseFloat(record.lon),
                        parseFloat(record.lat)
                    ]
                }
            }
            break


        case "aodb":
            var cols = "queue,name,timestamp,payload"
            var records = parse(csv, { columns: cols.split(","), quote: "'", relax: false })
            var record = records[0]
            var payload = getPayload(csv)

            switch (record.name) {
                case "flightboard":
                    /* {
                          info: "actual",
                          move: "departure",
                          flight: flight.flight,
                          airport: flight.airport,
                          date: dept.format("DD/MM"),
                          time: dept.format("HH:mm"),
                          parking: flight.parking
                    } */
                    const move = payload.move.substr(0,1).toUpperCase() + payload.move.slice(1).toLowerCase()

                    obj = {
                        source: 'aodb',
                        type: 'flightboard',
                        subject: move + " " + payload.flight + (payload.move == "departure" ? " to " :  " from ") + payload.airport,
                        body: "ETA " + payload.time,
                        timestamp: record.timestamp,
                        priority: 2,
                        icon: "fa-plane",
                        "icon-color": "info"
                    }
                    break


                case "parking":
                    /* {
                          info: "parking",
                          move: "available",
                          flight: flight.flight,
                          airport: flight.airport,
                          parking: flight.parking
                    } */
                    obj = {
                        source: 'aodb',
                        type: 'flightboard',
                        subject: "Parking " + payload.parking + " " + payload.move,
                        body: (payload.move == "available" ? "Departure " : "Arrrival ") + " " + payload.flight + (payload.move == "available" ? " to " :  " from ") + payload.airport,
                        timestamp: record.timestamp,
                        priority: 2,
                        icon: "fa-product-hunt",
                        "icon-color": (payload.move == "available" ? "success" : "warning")
                    }
                    break

                default:
                    ;
                    break
            } // end switch
            break

        default:
            ;
            break
    } // end switch
    return obj
}