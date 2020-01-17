# emit
 
node emit.js -f test-5-simpler.json -r 100 -s 60 -d --vertices


## To Do

### Determined time of event (shift timeline accordingly)

Set the datetime for a given position. Exemple: I want a plane to touch down at 14:25:30.

So need to compute path & timing first, then produce output so that touch down at 14:25:30.


### Alternate method to specify speed on path (eaasier to enter)

Specify speeds with external Point feature rather than speedsAtVertices and waitsAtVertices array



Next to a path (LineString), add Point(s) with properties like speed, pause, etc.

Find point on path that is the closest to supplied Point and use porperties of that point to determine behavior (speed, pause) of device.