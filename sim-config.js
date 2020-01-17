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
        "vlanding": 134,
        "ds4": 10
    }
}

exports.serviceTrucks = {
    "fuel": {
        "capacity": 30000,
        "speed": 40,
        "slow": 20,
        serviceTime: function(qty) { return qty / 50 }
    },
    "catering": {
        "capacity": 1,
        serviceTime: function(qty) { return qty * 600 }
    }
}

exports.services = {
    "fuel": {
        "trucks": [{
            "capacity": 30000,
            "speed": 40,
            "slow": 20 Î
        }],
        "base": [
            "FUEL1"
        ],
        serviceTime: function(qty) { return qty / 50 }
    },
    "catering": {
        "trucks": [{
            "capacity": 1,
            "speed": 40,
            "slow": 20 Î
        }],
        "base": [
            "cateringdepot"
        ],
        serviceTime: function(qty) { return qty * 20 * 60 } // seconds
    }
}
