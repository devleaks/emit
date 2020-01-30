const fs = require("fs");

const inputFile = {};
const outputFile = {};

inputFile.path = "./temp/out.csv";
outputFile.path = "../agregateOut.csv";

inputFile.exist = fs.existsSync(inputFile.path);
outputFile.exist = fs.existsSync(outputFile.path);

const addContent = path => {
  return fs.readFileSync(path, `utf8`);
};

outputFile.creation = () => {
  const initialdata = `name,lat,lon,timestamp,speed,heading,0\n`;
  fs.writeFileSync(outputFile.path, initialdata, { flag: "wx" });
};

outputFile.write = data => {
  fs.writeFileSync(outputFile.path, data, { flag: "wx" });
};

const readFile = () => {
  inputFile.content = addContent(inputFile.path);
  outputFile.content = addContent(outputFile.path);
};

const checkfiles = () => {
  if (inputFile.exist && outputFile.exist) {
    console.log(`files ok!`);
    return 2;
  } else {
    if (!inputFile.exist) {
      console.log(`${inputFile.path} does'nt exist!`);
      return 0;
    } else if (!outputFile.exist) {
      console.log(`${inputFile.path} does'nt exist!`);
      console.log(`init a new file`);
      outputFile.creation();
      return 1;
    } else {
      console.log(`001`);
      return 0;
    }
  }
};

const getAlreadyAgregedFiles = outputstring => {
  const firstLine = outputstring.split("\n")[0];
  const count = parseInt(outputstring.split(",")[6]);
  console.log(`${count} files already agregated.`);
  return count;
};

const agregate = (inpt, opt, cnt) => {
  console.log(`agregation start!`);

  const inptLineArray = inpt.split("\n");
  const optLineArray = opt.split("\n");

  let inptLastLineWright = "";
  let outptLastLineWright = "";

  let cursor = 0;

  finalContent = ``;

  finalContent += optLineArray[cursor];
  finalContent = finalContent.replace(cnt, cnt + 1);

  cursor++;

  while (inptLineArray[cursor] || optLineArray[cursor]) {
    if (inptLineArray[cursor]) {
      inptLastLineWright = inptLineArray[cursor];
    }
    finalContent += `\n${inptLastLineWright}`;
    cursor++;
    for (i = 0; i <= cnt; i++) {
      if (optLineArray[cursor]) {
        outptLastLineWright = optLineArray[cursor];
      }
      finalContent += `\n${outptLastLineWright}`;
      cursor++;
    }
  }

  return finalContent;
};

const formatFirstPush = inpt => {
  finalData = "";
  const line = inpt.split("\n");
  console.log(line[0]);
  cursor = 0;
  finalData += line[cursor];
  finalData += `,1`;
  cursor++;
  while (inpt[cursor]) {
    finalData += `\n${line[cursor]}`;
    cursor++;
  }
  return finalData;
};

const processing = () =>{
  const filesStatus = checkfiles();
  
  if (filesStatus == 1) {
    readFile();
    finaleData = formatFirstPush(inputFile.content);
    fs.writeFileSync(outputFile.path, finaleData);
  } else if (filesStatus == 2) {
    readFile();
    let count = getAlreadyAgregedFiles(outputFile.content);
    const finalData = agregate(inputFile.content, outputFile.content, count);
  
    fs.writeFileSync(outputFile.path, finalData);
  } else {
    console.log(`No input files!`);
  }
}

// launch the fil generation

processing();