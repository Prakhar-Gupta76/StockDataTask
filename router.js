const express = require('express');
const multer = require('multer');
const path = require('path');
const csv = require('csv-parser');
const fs = require('fs');
const moment = require('moment');
const Stock = require('./model.js')
const router = express.Router();

// Configure multer to store files temporarily in the 'uploads' folder
const upload = multer({
    dest: 'uploads/',
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext === '.csv') {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'), false);
        }
    },
});

// Required columns for validation
const REQUIRED_COLUMNS = [
    'Date', 'Symbol', 'Series', 'Prev Close', 'Open', 'High', 'Low',
    'Last', 'Close', 'VWAP', 'Volume', 'Turnover', 'Trades',
    'Deliverable Volume', '%Deliverble'
];

// Helper function to validate the CSV file and store the CSV file
function validateCSVAndStoreCSV(filePath) {
    let length = 0;
    let numberoffailedrecords = 0;
    let numberofsucceedrecords = 0;
    let failurereasons = new Set();
    const errors = []; // Store all errors for reporting

    return new Promise((resolve, reject) => {
        const columns = new Set(); // Use Set for faster lookups

        fs.createReadStream(filePath)
            .pipe(csv())
            .on('headers', (headers) => {
                console.log("Headers: ", headers);
                headers.forEach((header) => columns.add(header.trim()));
            })
            .on('data', async (row) => {
                length += 1;
                let recordfailed = false;

                // Validate Date
                const dateFormats = ['YYYY-MM-DD', 'MM/DD/YYYY', 'DD-MM-YYYY'];
                const isValidDate = dateFormats.some(format =>
                    moment(row.Date, format, true).isValid()
                );

                if (!isValidDate) {
                    const error = `Invalid date format in row ${length}`;
                    failurereasons.add(error);
                    errors.push(error);
                    console.log(row);
                    recordfailed = true;
                }

                // Validate numeric fields
                const numericFields = [
                    'Prev Close', 'Open', 'High', 'Low',
                    'Last', 'Close', 'VWAP', 'Volume',
                    'Turnover', 'Trades', 'Deliverable Volume', '%Deliverble'
                ];

                numericFields.forEach((field) => {
                    const value = row[field];
                    const parsedValue = parseFloat(value);
                    if (isNaN(parsedValue) || value === '') {
                        const error = `Invalid number in field '${field}' in row ${length}`;
                        failurereasons.add(error);
                        errors.push(error);
                        console.log(row);
                        recordfailed = true;
                    }
                });

                if (recordfailed) {
                    numberoffailedrecords += 1;
                }
                else {
                    const stockData = new Stock({
                        date: moment(row.Date, dateFormats, true).format('YYYY-MM-DD'),
                        symbol: row.Symbol,
                        series: row.Series,
                        prev_close: parseFloat(row['Prev Close']),
                        open: parseFloat(row.Open),
                        high: parseFloat(row.High),
                        low: parseFloat(row.Low),
                        last: parseFloat(row.Last),
                        close: parseFloat(row.Close),
                        vwap: parseFloat(row.VWAP),
                        volume: parseInt(row.Volume),
                        turnover: parseFloat(row.Turnover),
                        trades: parseInt(row.Trades),
                        deliverable: parseInt(row['Deliverable Volume']),
                        percent_deliverable: parseFloat(row['%Deliverble']),
                    });

                    try {
                        await stockData.save(); // Save to MongoDB
                        numberofsucceedrecords += 1;
                    } catch (err) {
                        const error = `Error saving record in row ${length}: ${err.message}`;
                        failurereasons.add(error);
                        errors.push(error);
                        numberoffailedrecords += 1;
                    }
                }
            })
            .on('end', () => {
                const missingColumns = REQUIRED_COLUMNS.filter(
                    (col) => !columns.has(col)
                );

                if (missingColumns.length > 0) {
                    const error = `Missing columns: ${missingColumns.join(', ')}`;
                    return reject(new Error(error));
                }

                // Calculate the number of successful records
                numberofsucceedrecords = length - numberoffailedrecords;

                // If there are validation errors, reject with detailed information
                if (errors.length > 0) {
                    const result = {
                        error: 'Validation errors found',
                        totalRecords: length,
                        failedRecords: numberoffailedrecords,
                        successfulRecords: numberofsucceedrecords,
                        failureReasons: Array.from(failurereasons),
                    };
                    return reject(result);
                }

                // If no errors, resolve the promise
                resolve({
                    message: 'File validated successfully',
                    totalRecords: length,
                    failedRecords: numberoffailedrecords,
                    successfulRecords: numberofsucceedrecords,
                });
            })
            .on('error', (err) => reject({ error: err.message }));
    });
}

// POST /upload endpoint
router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: 'No file uploaded or invalid file type' });
        }

        // Validate the uploaded CSV file
        const validationResult = await validateCSVAndStoreCSV(file.path);

        // Respond with success and validation details
        return res.status(201).json(validationResult);
    } catch (error) {
        console.error(error);
        return res.status(400).json(error);
    } finally {
        // Clean up: Delete the uploaded file after processing
        if (req.file) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('Error deleting file:', err);
            });
        }
    }
});

// Utility function to build date range filter
const buildDateFilter = (startDate, endDate) => {
    const filter = {};
    if (startDate) filter.date = { $gte: moment(startDate).format('YYYY-MM-DD') };
    if (endDate) {
        filter.date = filter.date || {};
        filter.date.$lte = moment(endDate).format('YYYY-MM-DD');
    }
    return filter;
};

// =============================================
// API 1: /api/highest_volume
// =============================================
router.get('/highest_volume', async (req, res) => {
    const { start_date, end_date, symbol } = req.query;
    const filter = buildDateFilter(start_date, end_date);
    if (symbol) filter.symbol = symbol;

    try {
        const records = await Stock.find(filter).sort({ volume: -1 }).limit(1);
        if (records.length === 0) {
            return res.status(404).json({ message: 'No records found' });
        }
        res.status(200).json(records[0]); // Return the record with the highest volume
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// =============================================
// API 2: /api/average_close
// =============================================
router.get('/average_close', async (req, res) => {
    const { start_date, end_date, symbol } = req.query;
    const filter = buildDateFilter(start_date, end_date);
    if (symbol) filter.symbol = symbol;

    try {
        const result = await Stock.aggregate([
            { $match: filter },
            { $group: { _id: null, averageClose: { $avg: '$close' } } }
        ]);

        if (result.length === 0) {
            return res.status(404).json({ message: 'No records found' });
        }
        res.status(200).json({ averageClose: result[0].averageClose });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// =============================================
// API 3: /api/average_vwap
// =============================================
router.get('/average_vwap', async (req, res) => {
    const { start_date, end_date, symbol } = req.query;
    const filter = buildDateFilter(start_date, end_date);
    if (symbol) filter.symbol = symbol;

    try {
        const result = await Stock.aggregate([
            { $match: filter },
            { $group: { _id: null, averageVWAP: { $avg: '$vwap' } } }
        ]);

        if (result.length === 0) {
            return res.status(404).json({ message: 'No records found' });
        }
        res.status(200).json({ averageVWAP: result[0].averageVWAP });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
