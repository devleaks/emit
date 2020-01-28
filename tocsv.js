const fs = require('fs')
var program = require('commander')

const debug = require('./debug.js')

debug.init(true, [""], "main")

program
    .version('1.0.0')
    .description('Convert data from FeatureCollection of Point to CSV')
    .option('-d, --debug', 'output extra debugging')
    .option('-n, --name <name>', 'device name',"device")
    .option('-o <file>, --output <file>', 'Save to file, default to out.json', "out.json")
    .requiredOption('-f, --file <file>', 'GeoJSON file to process')
    .parse(process.argv)

debug.init(program.debug, [""], "main")
debug.print(program.opts())

function tocsv(f) {
    var s = program.name
    s += ','+f.geometry.coordinates[1]+','+f.geometry.coordinates[0]
    if(f.geometry.coordinates.length > 2) // alt
        s += ','+f.geometry.coordinates[2]
    s += ','+f.properties.timestamp
    s += ','+f.properties.speed
    s += ','+f.properties.bearing
    debug.print(s)
    return s
}

function justDoIt(fc) {
    var strbuf = "name,lat,lon,timestamp,speed,heading\n"
    fc.features.forEach(function(f, idx) {
        if(f.type == "Feature" && f.geometry.type == "Point")
            strbuf += tocsv(f)+"\n"
    })
    return strbuf
}

const jsonstring = fs.readFileSync(program.file, 'utf8')

var res = justDoIt(JSON.parse(jsonstring))

fs.writeFileSync(program.O, res, { mode: 0o644 })
console.log(program.O + ' written')