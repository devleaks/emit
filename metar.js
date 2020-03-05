/*  https://aviationweather.gov/dataserver/example?datatype=metar
 *
 */

const fs = require("fs"); // Or `import fs from "fs";` with ESM
const https = require('https')
const moment = require('moment')
const parseString = require('xml2js').parseString

const debug = require('./lib/debug')

const fname = "eblg/json/METAR.json"
const url = "https://aviationweather.gov/adds/dataserver_current/httpparam?dataSource=metars&requestType=retrieve&format=xml&hoursBeforeNow=3&mostRecent=true&stationString="
const too_late = 30 // min

var program = require('commander')


program
    .version('1.0.0')
    .description('Fetches latest METAR data for supplied airport (ICAO code)')
    .option('-d, --debug', 'output extra debugging')
    .option('-o <file>, --output <file>', 'Save to file', fname)
    .option('-a <airport>, --airport <airport>', 'Fetches data for supplied airport ICAO code', "EBLG")
    .option('-r, --refresh', 'Force METAR update')
    .parse(process.argv)

debug.init(program.debug, [""])
debug.print(program.opts())


var furl = url + program.A
debug.print(furl)

function xmlToJson(url, callback) {
    var req = https.get(furl, function(res) {
        var xml = '';

        res.on('data', function(chunk) {
            xml += chunk;
        });

        res.on('error', function(e) {
            callback(e, null);
        });

        res.on('timeout', function(e) {
            callback(e, null);
        });

        res.on('end', function() {
            parseString(xml, function(err, result) {
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
        fs.writeFileSync(program.O, JSON.stringify(METAR, null, 2), { mode: 0o644 })
    })
    debug.print("METAR updated", fname)
}



try {
    const stats = fs.statSync(fname)
    var fdate = moment(stats.mtime).add(too_late, 'm')
    if (fdate.isBefore(moment()) || program.refresh)
        getMetar()
    else
        debug.print("METAR up-to-date")
} catch (e) {
    getMetar()
}