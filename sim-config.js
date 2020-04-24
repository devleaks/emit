exports.airport = {
    "runways": [
        ["04L", "22R"],
        ["04R", "22L"]
    ],
    "file": "eblg/json/eblg-area.geojson",
    "airfield": "eblg/json/eblg-estate.geojson",
    "parkings": "eblg/json/eblg-parking-centroids.geojson",
    "taxiways": "eblg/json/eblg-taxiways.geojson",
    "service": "eblg/json/eblg-serviceroads.geojson",
    "pois": "eblg/json/eblg-pois.geojson",
    "airways": "eblg/json/eblg-sids-stars.geojson",
    "metar": "eblg/json/METAR.json",
    "sid": {
        "04": [
            "BUB7R",
            "CIV3R",
            "LNO8R"
        ],
        "22": [
            "BUB7S",
            "CIV3S",
            "LNO5E",
            "LNO7S"
        ]
    },
    "star": {
        "04": [
            "LNO4D",
            "GESLO4D",
            "CIV5D",
            "KOK5D",
            "NIK5D"
        ],
        "22": [
            "LNO4X",
            "GESLO4X",
            "CIV5X",
            "KOK5X",
            "NIK5X"
        ]
    },
    "taxi-hold": [60, 300],
    "takeoff-hold": [10, 60],
    "departure-delay": [-15, 30],
    "arrival-delay": [-20, 30],
    "aprons": {
        "PAX": [1],
        "CARGO": [2, 3, 5, 6]
    }
}

// aircraft speeds are in kn
// distances are in meters
// altitudes are in meters or FL
exports.aircrafts = {
    "A321Neo": {
        "type": "PAX",
        "takeoff-distance": 2200,
        "landing-distance": 1700,
        "taxispeed": 15,
        "v2": 180,
        "cg0": 12,
        "vclimb1": 200,
        "cg1": 12,
        "vclimb2": 250,
        "cg2": 10,
        "vclimb3": 250,
        "cg3": 10,
        "vcruze": 450,
        "vinitialdescend": 450,
        "dg0": 10,
        "vdescend": 290,
        "dg1": 10,
        "vdescend2": 210,
        "dg2": 10,
        "vapproach": 160,
        "dg3": 10,
        "vlanding": 134,
        "dg4": 10
    },
    "B747": {
        "type": "CARGO",
        "takeoff-distance": 2200,
        "landing-distance": 1700,
        "taxispeed": 15,
        "v2": 180,
        "vs0": 12,
        "vclimb1": 200,
        "cs1": 14,
        "vclimb2": 250,
        "cs2": 10,
        "vclimb3": 300,
        "cs3": 10,
        "vcruze": 450,
        "vinitialdescend": 450,
        "ds0": 10,
        "vdescend": 290,
        "ds1": 10,
        "vdescend2": 210,
        "ds2": 10,
        "vapproach": 160,
        "ds3": 10,
        "vlanding": 150,
        "ds4": 10
    }
}

exports.services = {
    "fuel": {
        "trucks": [{
                "name": "fuel1",
                "color": "#aa0000",
                "capacity": 30000,
                "speed": 40,
                "slow": 20,
                "rate": 10,
                serviceTime: function(qty) { return qty / 5 },
                refillTime: function(qty) { return qty / 50 }
            },
            {
                "name": "fuel2",
                "color": "#aa6600",
                "capacity": 30000,
                "speed": 30,
                "slow": 15,
                "rate": 10,
                serviceTime: function(qty) { return qty / 5 },
                refillTime: function(qty) { return qty / 50 }
            }
        ],
        "base": [
            "FUEL0",
            "FUEL1"
        ],
        "rate": 10,
        "afterOnBlocks": 20,
        "beforeOffBlocks": 15,
        serviceTime: function(qty) { return qty / 5 },
        refillTime: function(qty) { return qty / 50 },
        randomQuantity: function() { return (4000 + Math.floor(Math.random() * 10) * 500) }
    },
    "baggage": {
        "trucks": [{
                "name": "baggage1",
                "color": "#aa0000",
                "capacity": 30000,
                "speed": 40,
                "slow": 20
            },
            {
                "name": "baggage2",
                "color": "#aa6600",
                "capacity": 30000,
                "speed": 40,
                "slow": 20
            }
        ],
        "base": [
            "BAGGAGE1",
            "BAGGAGE2",
            "BAGGAGE3"
        ],
        "rate": 30,
        "rate-quiet": true,
        "afterOnBlocks": 10,
        "beforeOffBlocks": 10,
        serviceTime: function(qty) { return 15 * 60 },
        refillTime: function(qty) { return 10 * 60 },
        randomQuantity: function() { return (6 + Math.floor(Math.random() * 8)) }
    },
    "catering": {
        "trucks": [{
            "name": "catering1",
            "color": "#00aa00",
            "capacity": 1,
            "speed": 40,
            "slow": 20
        }],
        "base": [
            "CATERING1",
            "CATERING2"
        ],
        "afterOnBlocks": 5,
        "beforeOffBlocks": 10,
        "rate": 10,
        "speed": 40,
        serviceTime: function(qty) { return qty * 20 * 60 }, // seconds
        refillTime: function(qty) { return qty * 12 * 60 },
        randomQuantity: function() { return (1 + Math.floor(Math.random() * 2)) }
    },
    "sewage": {
        "color": "#00aaaa",
        "trucks": [{
            "name": "sewage1",
            "color": "#00aaaa",
            "capacity": 10,
            "speed": 30,
            "slow": 10
        }],
        "base": [
            "SEWAGE"
        ],
        "afterOnBlocks": 15,
        "beforeOffBlocks": 15,
        "rate": 30,
        "speed": 30,
        serviceTime: function(qty) { return 15 * 60 }, // seconds
        refillTime: function(qty) { return 20 * 60 },
        randomQuantity: function() { return 1 }
    },
    "towing": {
        "trucks": [{
            "name": "tow1",
            "color": "#0000aa",
            "capacity": 1,
            "speed": 20,
            "slow": 5
        }],
        "base": [
            "TOW1"
        ],
        "rate": 30,
        "rate-quiet": true,
        "afterOnBlocks": 0,
        "beforeOffBlocks": 2,
        serviceTime: function(qty) { return 7 * 60 }, // seconds
        refillTime: function(qty) { return 0 },
        randomQuantity: function() { return 1 }
    },
    "cargo": {
        "trucks": [{
            "name": "cargo1",
            "color": "#00aa00",
            "capacity": 1,
            "speed": 20,
            "slow": 5
        }],
        "base": [                       // must match aiport.aprons.cargo
            "CARGO2",
            "CARGO3",
            "CARGO5",
            "CARGO6"
        ],
        "freit-quantity": [8, 12],
        "freit-service-time": 5,        // minutes
        "rate": 30,                     // seconds
        "afterOnBlocks": 10,            // cargo service can only start 10 minutes after onblok
        "beforeOffBlocks": 10,          // cargo service must be completed 10 minutes before offblok
        serviceTime: function(qty) { return 4 * 60 }, // seconds
        refillTime: function(qty) { return 2 * 20 },
        randomQuantity: function() { return 1 }
    }
}

exports.simulation = {
    "aodb-preannounce": 6 * 60 * 60,    // how long before a flight scheduled time is announced.
    "aodb-planned-uncertainly": 10 * 60,  // When planned is announed, add random uncertainly.
    "aodb-planned-timeframe": [40, 20], // "planned time" is announced between 20 and 60 minutes before the event.
    "arrival-delays": [-20, 50],        // random delay to flight, in minutes
    "departure-delays": [-10, 30],      // random delay to flight, in minutes
    "paxratio": 0.2,                    // ratio between passenger and cargo flights, 0=cargo only, 1=pax only.
    "jitter": 10,                       // global GPS precision in meter
    "time-between-flights": [5,25],     // minimum and maximum time between fights. Exact time rounded to 5 minutes.
    "turnaround-time": [70,120]         // minimum and maximum turnaround time
}

// Miscellaneous (standardized) CSV prruduced for Kafka. Payload is often a JSON-formatted strinfified string.
exports.CSV = {
    "DEVICE": "queue,name,timestamp,lat,lon,alt,speed,heading,payload",
    "MESSAGE": "queue,type,timestamp,payload",
    "SENSOR": "queue,name,timestamp,payload"
}

exports.websocket = {
    host: 'localhost',
    port: 8051
}