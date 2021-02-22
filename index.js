const sqlite3 = require('sqlite3');
const path = require('path');
const express = require("express");
const bodyParser = require('body-parser')
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
                console.log("Baza danych już istnieje 👍");
            }
            //let insert = 'INSERT INTO outsideSensor (humadity, pressure, temperature, result_time, voltage) VALUES (?,?,?,?,?)';
            //db.run(insert, ["88", "1013", "9.5", "2021-01-22 20:30:18", "3.3"]);
        });
    }
});
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'www/index.html'));
});

app.get("/api/outside/:param", (req, res, next) => {
    var param = [req.params.param]
    if(param == "all"){
        db.all("SELECT * FROM outsideSensor", [], (err, rows) => {
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

app.get('/api/sys_info_post', (req, res) => {
    console.log(req.query)
    res.send('OK');
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