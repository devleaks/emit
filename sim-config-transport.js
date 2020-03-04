exports.roads = {
    "highways-file": {
        "belgie-antwerpen": "eblg/json-tr/Belgie-Antwerpen.geojson",
        "belgie-zeebrugge": "eblg/json-tr/Belgie-Zeebrugge.geojson",
        "deutschland-aachen": "eblg/json-tr/Deutschland-Aachen.geojson",
        "deutschland-stvith": "eblg/json-tr/Deutschland-StVith.geojson",
        "holland-breda": "eblg/json-tr/Holland-Breda.geojson",
        "holland-maastrich": "eblg/json-tr/Holland-Maastricht.geojson",
        "luxembourg-luxembourg": "eblg/json-tr/Luxembourg-Luxembourg.geojson",
        "france-lille": "eblg/json-tr/France-Lille.geojson",
        "france-paris": "eblg/json-tr/France-Paris.geojson"
    },
    "localroads-file": "eblg/json-tr/localroads.geojson",
    "parking-file": "eblg/json-tr/ramp-parkings.geojson"
}

exports.trucks = {
    "truck-models": {
        "30T": {
            "speed": 80,
            "slow": 45,
            "park": 10
        },
        "15T": {
            "speed": 85,
            "slow": 55,
            "park": 15
        }
    }
}

exports.services = {
    "handlers": {
        "handler1": ["N11", "N12"],
        "handler2": ["N21", "N22", "N23"],
        "handler3": ["S11", "S12"],
        "handler4": ["S21", "S22"],
        "handler5": ["S31", "S32"]
    },
    "freit": {
        "trucks": [{
            name: "freit1",
            color: "#00aa00",
            capacity: 1,
            speed: 30,
            slow: 5
        }],
        "freit-quantity": [8, 12],
        "freit-service-time": 5,        // minutes
        rate: 30, // seconds
        afterOnBlocks: 10, // cargo service can only start 10 minutes after onblok
        beforeOffBlocks: 10, // cargo service must be completed 10 minutes before offblok
        serviceTime: function(qty) { return 20 * 60 }, // seconds
        refillTime: function(qty) { return 25 * 60 },
        randomQuantity: function() { return 1 }
    }
}

exports.simulation = {
    "jitter": 10,                       // global GPS precision in meter
    "time-between-transports": [2,25],  // minimum and maximum time between fights. Exact time rounded to 5 minutes.
    "loading-time": [35,75]          // minimum and maximum turnaround time
}