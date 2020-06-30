/*  https://aviationweather.gov/dataserver/example?datatype=metar
 *
 */

import fs from "fs"; // Or `import fs from "fs";` with ESM

import https from "https";
import moment from "moment";
import * as xml2js from "xml2js";
import * as debug from "./lib/debug.js";

const fname = "data/airport/METAR.json"
const url = "https://aviationweather.gov/adds/dataserver_current/httpparam?dataSource=metars&requestType=retrieve&format=xml&hoursBeforeNow=3&mostRecent=true&stationString="
const too_late = 30 // min

import program from "commander";


program
    .version("1.0.0")
    .description("Fetches latest METAR data for supplied airport (ICAO code)")
    .option("-d, --debug", "output extra debugging")
    .option("-o <file>, --output <file>", "Save to file", fname)
    .option("-a <airport>, --airport <airport>", "Fetches data for supplied airport ICAO code", "EBLG")
    .option("-r, --refresh", "Force METAR update")
    .parse(process.argv)

debug.init(program.debug, [""])
debug.print(program.opts())


var furl = url + program.A
debug.print(furl)

function xmlToJson(url, callback) {
    var req = https.get(furl, function(res) {
        var xml = "";

        res.on("data", function(chunk) {
            xml += chunk;
        });

        res.on("error", function(e) {
            callback(e, null);
        });

        res.on("timeout", function(e) {
            callback(e, null);
        });

        res.on("end", function() {
            xml2js.default.parseString(xml, function(err, result) {
                callback(null, result);
            });
        });
    });
}


function getMetar() {
    xmlToJson(url, function(err, data) {
        if (err) {
            // Handle this however you like
            return console.err(err);
        }

        // Do whatever you want with the data here
        // Following just pretty-prints the object
        var METAR = data["response"]["data"][0]["METAR"][0]
        METAR.raw_timestamp = [moment().toISOString()]
        fs.writeFileSync(program.O, JSON.stringify(METAR, null, 2), { mode: 0o644 })
    })
    debug.print("METAR updated", fname)
}



try {
    const stats = fs.statSync(fname)
    var fdate = moment(stats.mtime).add(too_late, "m")
    if (fdate.isBefore(moment()) || program.refresh)
        getMetar()
    else
        debug.print("METAR up-to-date")
} catch (e) {
    getMetar()
}

// Historical metar here:
// https://www.ogimet.com/display_metars2.php?lang=en&lugar=EBLG&tipo=SA&ord=REV&nil=SI&fmt=txt&ano=2020&mes=03&day=24&hora=09&anof=2020&mesf=03&dayf=25&horaf=09&minf=59&send=send

// Link to windity: https://www.windy.com/EBLG?49.063,7.674,7
// Zoom 15 is perfect

