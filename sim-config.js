exports.airport = {
    "runways": [
        ["04L", "22R"],
        ["04R", "22L"]
    ],
    "file": "eblg/json/eblg-area.geojson",
    "airfield": "eblg/json/eblg-estate.geojson",
    "parkings": "eblg/json/eblg-parkings.geojson",
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
    "takeoff-hold": [10, 60]
}

// aircraft speeds are in kn
// distances are in meters
// altitudes are in meters or FL
exports.aircrafts = {
    "A321Neo": {
        "takeoff-distance": 2200,
        "landing-distance": 1700,
        "taxispeed": 15,
        "v2": 180,
        "cg0": 12,
        "vclimb1": 200,
        "cg1": 12,
        "vclimb2": 220,
        "cg2": 10,
        "vclimb3": 220,
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
        "takeoff-distance": 2200,
        "landing-distance": 1700,
        "taxispeed": 15,
        "v2": 180,
        "vs0": 12,
        "vclimb1": 200,
        "cs1": 14,
        "vclimb2": 220,
        "cs2": 10,
        "vclimb3": 220,
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
            serviceTime: function(qty) { return qty / 50 },
            refillTime: function(qty) { return qty / 75 }
        },
        {
            "name": "fuel2",
            "color": "#aa6600",
            "capacity": 30000,
            "speed": 40,
            "slow": 20,
            serviceTime: function(qty) { return qty / 50 },
            refillTime: function(qty) { return qty / 75 }
        }],
        "base": [
            "FUEL1",
            "FUEL2"
        ],
        serviceTime: function(qty) { return qty / 50 },
        refillTime: function(qty) { return qty / 75 }
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
            "CATERING1"
        ],
        serviceTime: function(qty) { return qty * 20 * 60 }, // seconds
        refillTime: function(qty) { return qty * 12 * 60 }    }
}
