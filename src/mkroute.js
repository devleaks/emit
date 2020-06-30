import fs from "fs";
import moment from "moment";
import request from "request";
import program from "commander";
import * as debug from "./lib/debug.js";
import * as geojson from "./lib/geojson-util.js";
import * as wallet from "./data/wallet.js";

program
    .version("1.0.0")
    .description("generates route between 2 points through Mapbox Routing API (free token API requested)")
    .option("-d, --debug", "output extra debugging")
    .option("-o, --output <file>", "Save to file, default to out.csv", "out.json")
    .requiredOption("-s, --start <lat,lon>", "Departure position")
    .requiredOption("-e, --end <lat,lon>", "Arrival position")
    .parse(process.argv)

debug.init(program.debug, [""])
debug.print(program.opts())

/* test data
let p1 = [5.397891998291016,
    50.6911836784961
]
let p2 = [5.472859740257263,
    50.648324408391076
]
let url = base_url + p1[0] + "," + p1[1] + ";" + p2[0] + "," + p2[1] + "?geometries=geojson&access_token=" + wallet.mapbox_api_token
-s 5.397891998291016,50.6911836784961 -e 5.472859740257263,50.648324408391076
*/
const base_url = "https://api.mapbox.com/directions/v5/mapbox/driving/"
const url = base_url + program.start + ";" + program.end + "?geometries=geojson&access_token=" + wallet.mapbox_api_token


request(url, function(error, response, body) {
    if (error) {
        console.log(error)
        return
    }
    let j = JSON.parse(body)

    if (j.code == "Ok") {
        let f = {
            type: "Feature",
            properties: {},
            geometry: j.routes[0].geometry
        }
        debug.print(f)

        fs.writeFileSync(program.output, JSON.stringify( geojson.FeatureCollection([f])), { mode: 0o644 })
        debug.print(program.output + " written")
    }
})

/* Note: Documentation

   ============================================
   RESPONSE FROM MAPBOX API AS OF 2020-03-23
   ============================================

{
    "routes": [
    {
        "weight_name": "routability",
        "legs": [
        {
            "summary": "E40, E42",
            "steps": [],
            "distance": 9387.056,
            "duration": 366.184,
            "weight": 366.184
        }],
        "geometry":
        {
            "coordinates": [
                [5.39789, 50.691181],
                [5.401739, 50.690807],
                [5.455368, 50.67857],
                [5.470676, 50.674465],
                [5.479188, 50.67128],
                [5.479437, 50.671112],
                [5.483829, 50.667622],
                [5.48701, 50.660122],
                [5.487031, 50.65691],
                [5.485383, 50.654182],
                [5.475615, 50.648552],
                [5.472862, 50.648331]
            ],
            "type": "LineString"
        },
        "distance": 9387.056,
        "duration": 366.184,
        "weight": 366.184
    }],
    "waypoints": [
    {
        "distance": 0.425,
        "name": "",
        "location": [5.397891, 50.691181]
    },
    {
        "distance": 0.866,
        "name": "",
        "location": [5.472862, 50.648331]
    }],
    "code": "Ok",
    "uuid": "jsjVm57qSy9SQwQ4GRwLAWcdBSidgX9O3xfEUc2166LKkg6OaW1ilQ=="
}
==================================================== */