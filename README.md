# emit

node emit -h 

node emit -d -f test-5-simpler.json -r 100 -s 60 --vertices


## To Do

### Determined time of event (shift timeline accordingly)

Set the datetime for a given position. Exemple: I want a plane to touch down at 14:25:30.

So need to compute path & timing first, then produce output so that touch down at 14:25:30.

addMarker add "sync" event (e.g. point.properties.sync = 4).

when generating csv, date passed as argument will be the date of the synced event.


### Airplane altitude

Currently, planes crawl on the ground. Kinda fast cars.
Altitude will be added soon.



## Refactoring

addPoint(point, properties) / addMarker
