set /a num=%random% %%1000 +1
ECHO %num%
node sim.js -o ./temp/out.json
node tocsv.js -f ./temp/out.json -o ./temp/out.csv -n dev%num%
node ./agregate/agregate