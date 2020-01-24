const fs = require('fs')
var cover = require('tile-cover')
var vtGeoJson = require('vt-geojson')

var polygon = JSON.parse(fs.readFileSync('eblg/json/eblg.geojson'))

console.log(polygon)

//mapbox://styles/pmareschal/ck5ml1ytu0whb1imwnan981dv
var source = 'tilejson+http://api.mapbox.com/v4/mapbox.mapbox-streets-v8/page.html?access_token=pk.eyJ1IjoicG1hcmVzY2hhbCIsImEiOiJjaWZmYjhwN3cwMGpudGVseDI3c214czgyIn0.z3SZzxcqSANBIACOMWDfbQ'

// get an array of tiles ([x, y, z]) that we want to pull data from.
var tiles = cover.tiles(polygon.geometry, { min_zoom: 18, max_zoom: 18 })

// stream geojson from the chosen tiles:
vtGeoJson(source, tiles)
  .on('data', function (feature) {
    console.log("it's a GeoJSON feature!", feature.geometry.type, feature.properties)
  })
  .on('end', function () {
    console.log('all done')
  })