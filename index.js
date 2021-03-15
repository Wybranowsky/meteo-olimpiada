const sqlite3 = require('sqlite3');
const path = require('path');
const fetch = require("node-fetch");
const express = require("express");
const bodyParser = require('body-parser')
const NodeCache = require( "node-cache" );
const cache = new NodeCache();
const app = express();

const HTTP_PORT = 8000
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())
app.use('/assets', express.static(path.join(__dirname, 'assets')));

app.listen(HTTP_PORT, () => {
    console.log("Serwer nasłuchuje na porcie: " + HTTP_PORT);
});

const db = new sqlite3.Database('./meteo_database.db', (err) => {
    if (err) {
        console.error("Błąd bazy danych: " + err.message);
    } else {
        db.run('CREATE TABLE outsideSensor( \
            result_id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,\
            humadity DOUBLE NOT NULL,\
            pressure DOUBLE NOT NULL,\
            temperature DOUBLE NOT NULL,\
            result_time INTEGER NOT NULL,\
            voltage DOUBLE NOT NULL\ )', (err) => {
            if (err) {
                console.log("Tabela outsideSensor już istnieje 👍");
            }
            //let insert = 'INSERT INTO outsideSensor (humadity, pressure, temperature, result_time, voltage) VALUES (?,?,?,?,?)';
            //db.run(insert, ["88", "1013", "9.5", "2021-01-22 20:30:18", "3.3"]);
        });
        db.run('CREATE TABLE insideSensor( \
            result_id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,\
            temperature DOUBLE NOT NULL,\
            result_time INTEGER NOT NULL\ )', (err) => {
            if (err) {
                console.log("Tabela insideSensor już istnieje 👍");
            }
        });
    }
});
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'www/index.html'));
});

app.get('/switch/:param', (req, res) => {
    let param = [req.params.param]
    let settings = { method: "Get" };
    if(param == "get"){
        fetch("http://192.168.0.210/control?cmd=Status,GPIO,0", settings)
            .then((res) => res.json())
            .then((json) => {
                if(json.state == 0){
                    res.status(200).json({ "state": "on" });
                } else {
                    res.status(200).json({ "state": "off" });
                }
        });
    } else if (param == "on"){
        fetch("http://192.168.0.210/control?cmd=GPIO,0,0", settings)
            .then((res) => res.json())
            .then((json) => {
                res.status(200).json( json.log );
        });
    } else if (param == "off"){
        fetch("http://192.168.0.210/control?cmd=GPIO,0,1", settings)
            .then((res) => res.json())
            .then((json) => {
                res.status(200).json( json.log );
        });
    }
});

app.get("/api/outside/:param", (req, res, next) => {
    var param = [req.params.param]
    if(param == "24h"){
        db.all("SELECT ROUND(AVG(temperature), 1) AS temperature, ROUND(AVG(humadity), 1) AS humadity, ROUND(AVG(pressure), 1) AS pressure, ROUND(AVG(voltage), 1) AS voltage, strftime('%d.%m.%Y %H', datetime(result_time, 'unixepoch', 'localtime')) AS time FROM outsideSensor GROUP BY time ORDER BY result_id LIMIT 24", [], (err, rows) => {
            if (err) {
                res.status(400).json({ "error": err.message });
                return;
            }
            res.status(200).json({ rows });
        });
    } else if (param == "last"){
        db.get("SELECT * FROM outsideSensor ORDER BY result_id DESC LIMIT 1", [], (err, row) => {
            if (err) {
                res.status(400).json({ "error": err.message });
                return;
            }
            res.status(200).json(row);
        });
    }

});

app.get("/api/inside/:param", (req, res, next) => {
    var param = [req.params.param]
    if(param == "24h"){
        db.all("SELECT ROUND(AVG(temperature), 1) AS temperature, strftime('%d.%m.%Y %H', datetime(result_time, 'unixepoch', 'localtime')) AS time FROM insideSensor GROUP BY time ORDER BY result_id LIMIT 24", [], (err, rows) => {
            if (err) {
                res.status(400).json({ "error": err.message });
                return;
            }
            res.status(200).json({ rows });
        });
    } else if (param == "last"){
        db.get("SELECT * FROM insideSensor ORDER BY result_id DESC LIMIT 1", [], (err, row) => {
            if (err) {
                res.status(400).json({ "error": err.message });
                return;
            }
            res.status(200).json(row);
        });
    }

});

app.get('/api/outside_post', (req, res) => {
    let query = req.query;
    let timestamp = Math.floor(Date.now() / 1000);
    db.run("INSERT INTO outsideSensor (humadity, pressure, temperature, result_time, voltage) VALUES (?,?,?,?,?)",
        [query.hum, query.pres, query.temp, timestamp, query.vcc],
        function (err, result) {
            if (err) {
                res.status(400).json({ "error": err.message })
                return;
            }
            res.status(201).json({
                "result_id": this.lastID
            })
            console.log(req.query)
        });
});

app.get('/api/inside_post', (req, res) => {
    let query = req.query;
    let timestamp = Math.floor(Date.now() / 1000);
    db.run("INSERT INTO insideSensor (temperature, result_time) VALUES (?,?)",
        [query.temp, timestamp],
        function (err, result) {
            if (err) {
                res.status(400).json({ "error": err.message })
                return;
            }
            res.status(201).json({
                "result_id": this.lastID
            })
            console.log(req.query)
        });
});

app.get('/api/sys_info_post/:param', (req, res) => {
    var param = [req.params.param]
    if(param == "outside"){
        cache.set( "outside_IP", req.query.ip, 0 );
        console.log("Połączono ze stacją meteo: "+cache.get("outside_IP"))
        res.status(201).send("OK")
    } else if (param == "inside"){
        cache.set( "inside_IP", req.query.ip, 0 );
        console.log("Połączono z inteligentną listwą: "+cache.get("inside_IP"))
        res.status(201).send("OK")
    } else{
        res.status(201).json({
            "outside_IP": cache.get("outside_IP"),
            "inside_IP": cache.get("inside_IP")
        })
    }
});

app.delete("/api/outside/:id", (req, res, next) => {
    db.run(`DELETE FROM outsideSensor WHERE result_id = ?`,
        req.params.id,
        function (err, result) {
            if (err) {
                res.status(400).json({ "error": res.message })
                return;
            }
            res.status(200).json({ deletedID: this.changes })
        });
});