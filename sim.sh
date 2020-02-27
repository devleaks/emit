#!/bin/bash
#
# sim.sh rel. 1.0.0
#

COUNT=0
CLEAN="NO"
POSITIONAL=()

while [[ $# -gt 0 ]]
do
    key="$1"
    case $key in
        -c|--count)
        COUNT="$2"
        shift # past argument
        shift # past value
        ;;
        --clean)
        CLEAN="YES"
        shift # past argument
        ;;
        *)    # unknown option
        POSITIONAL+=("$1") # save it in an array for later
        shift # past argument
        ;;
    esac
done

set -- "${POSITIONAL[@]}" # restore positional parameters
if [ $COUNT -gt 0 ]
then   
    tempfile=fb$$.csv
    node mkfb.js -c $COUNT -o $tempfile
    node flightboard.js -f $tempfile
    rm -f $tempfile
    cat FLIGHT-*.csv SERVICE-*.csv | sort -t , -k 3 -o out.csv
    ls -l out.csv
fi

if [ $CLEAN = "YES" ]
  then rm -f FLIGHT-*.{csv,json} SERVICE-*.{csv,json}
fi