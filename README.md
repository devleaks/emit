## To Do

### Airplane altitude

Currently, planes crawl on the ground. Kinda fast cars.
Altitude will be added soon.

Parking are randomly assigned. It possible that two planes park on same parking.


$ grep apron *parkin* |sort -u
        "apron": 2
        "apron": 3
        "apron": 4
        "apron": 5
        "apron": 6
$ grep apron *parkin* | grep 2 | wc -l
      32
$ grep apron *parkin* | grep 3 | wc -l
      21
$ grep apron *parkin* | grep 4 | wc -l
      22
$ grep apron *parkin* | grep 5 | wc -l
       5
$ grep apron *parkin* | grep 6 | wc -l
       5


Investigate possibility to "reverse" trip.


Add startdate to mkfb et mktb.

Add "queue" to planes taking off / landing

Add "queue" for parking

Add "queue" to trucks in front of parking if all parking full.

The difficulty is to know the time of parking/runway request and book it then...