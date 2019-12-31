var PathFinder = require('geojson-path-finder'),
    geojsonTool = require('geojson-tools'),
    geojson = require('./eblg-taxi.json');

geojson.features.forEach(function(f) {
	if(f.properties && f.properties.name && f.properties.name.indexOf("LT_") > -1) {
		f.geometry.coordinates = geojsonTool.complexify(f.geometry.coordinates, 0.01); // 1=1 km. 0.01 = 10m (minimum)
	}
});

var pathfinder = new PathFinder(geojson, {
						precision: 0.00005,
						weightFn: function(a, b, props) {
					        var dx = a[0] - b[0];
					        var dy = a[1] - b[1];
							var d = Math.sqrt(dx * dx + dy * dy);
							if(props && props.name && props.name.indexOf('LT_') == 0 && props.direction) { // Landing track, only goes in one direction
								return props.direction ==  1 ? {forward: d, backward: null} : {forward: null, backward: d};					
							}
					        return d;
					    }
					});

var path = pathfinder.findPath(
{
	"type": "Feature",
	"properties": {
		"marker-color": "#7E7E7E",
		"marker-size": "medium",
		"marker-symbol": "",
		"name": "LAND_23R_SHORT"
	},
	"geometry": {
		"type": "Point",
		"coordinates": [
			5.438747406005859,
			50.63672398979986
		]
	}
},
{
	"type": "Feature",
	"properties": {
		"marker-color": "#7E7E7E",
		"marker-size": "medium",
		"marker-symbol": "",
		"name": "P112"
	},
	"geometry": {
		"type": "Point",
		"coordinates": [
			5.457978844642639,
			50.64383936616151
		]
	}
}
);

if(path) {
	var trajet = {
		type: "FeatureCollection",
		features: [
			{
				type: 'Feature',
				properties: {
					name: 'Shortest path'
				},
				geometry: {
					type: "LineString",
					coordinates: path.path
				}
				
			}
		]
	}
	console.log(JSON.stringify(trajet));
}else
	console.log('Cannot find path');
