exports.roads = {
    "highways-file": {
        "belgie-antwerpen": "eblg/json-tr/Belgie-Antwerpen.geojson",
        "belgie-zeebrugge": "eblg/json-tr/Belgie-Zeebrugge.geojson",
        "deutschland-aachen": "eblg/json-tr/Deutschland-Aachen.geojson",
        "deutschland-stvith": "eblg/json-tr/Deutschland-StVith.geojson",
        "holland-breda": "eblg/json-tr/Holland-Breda.geojson",
        "holland-maastricht": "eblg/json-tr/Holland-Maastricht.geojson",
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
        "handler1": ["S11", "S12"],
        "handler2": ["S21", "S22"],
        "handler3": ["S31", "S32"],
        "handler4": ["S41", "S42"],
        "handler5": ["N51", "N52"],
        "handler6": ["N61", "N62", "N63"]
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
        rate: 120, // seconds
        afterOnBlocks: 10, // cargo service can only start 10 minutes after onblok
        beforeOffBlocks: 10, // cargo service must be completed 10 minutes before offblok
        serviceTime: function(qty) { return 20 * 60 }, // seconds
        refillTime: function(qty) { return 25 * 60 },
        randomQuantity: function() { return 1 }
    }
}

exports.simulation = {
    "time-between-transports": [2,25],  // minimum and maximum time between fights. Exact time rounded to 5 minutes.
    "loading-time": [35,75],          // minimum and maximum turnaround time
    "warehouse-preannounce": 4 * 60,    // how long before a transport scheduled time is announced.
    "warehouse-planned-timeframe": [40, 20], // "planned time" is announced between 40 and 60 minutes before the event.
    "warehouse-planned-uncertainly": 10 * 60,  // When planned is announed, add random uncertainly.
    "arrival-delays": [-20, 50],        // random delay to flight, in minutes
    "departure-delays": [-10, 30],      // random (additional) delay to flight, in minutes
    "eta-preannounce": 180,              // starts reporting ETA 180 minutes before arrival
    "eta-report": [7, 15],      // reports ETA every between 7 and 15 minutes.
    "eta-variation": [0, 7],      // At each report, ETA is adjusted by that amount minutes
    "jitter": 10                       // global GPS precision in meter
}

exports.CSV = {
    "TRUCK": "move,handler,parking,truck,destination,date,time"

}