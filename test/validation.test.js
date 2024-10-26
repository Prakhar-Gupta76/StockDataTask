const chai = require('chai');
const sinon = require('sinon');
const { expect } = chai;
const fs = require('fs-extra');
const path = require('path');
const moment = require('moment');
const validateCSVAndStoreCSV = require('../router.js').validateCSVAndStoreCSV; // Adjust path
const Stock = require('../model.js'); // Mock this in tests

// Mock CSV Data
const validCSVContent = `
Date,Symbol,Series,Prev Close,Open,High,Low,Last,Close,VWAP,Volume,Turnover,Trades,Deliverable Volume,%Deliverble
2024-01-01,ABC,EQ,100,101,102,99,101,102,101.5,1000,10000,10,500,50.0
`;

const invalidCSVContent = `
Date,Symbol,Series,Prev Close,Open,High,Low,Last,Close,VWAP,Volume,Turnover,Trades,Deliverable Volume,%Deliverble
InvalidDate,ABC,EQ,abc,101,102,99,101,102,101.5,1000,10000,10,500,50.0
`;

describe('CSV Validation and Storage', () => {
    let writeFileStub, unlinkStub;

    beforeEach(() => {
        // Stubs to mock file operations
        writeFileStub = sinon.stub(fs, 'writeFile').resolves();
        unlinkStub = sinon.stub(fs, 'unlink').resolves();
        sinon.stub(Stock.prototype, 'save').resolves(); // Mock DB save
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should validate and store a valid CSV file successfully', async () => {
        const filePath = path.resolve('test.csv');
        await fs.writeFile(filePath, validCSVContent); // Create a mock CSV file

        const result = await validateCSVAndStoreCSV(filePath);
        expect(result).to.deep.equal({
            message: 'File validated successfully',
            totalRecords: 1,
            failedRecords: 0,
            successfulRecords: 1,
        });

        await fs.unlink(filePath); // Clean up mock file
    });

    it('should reject with validation errors for invalid CSV data', async () => {
        const filePath = path.resolve('invalid_test.csv');
        await fs.writeFile(filePath, invalidCSVContent); // Create invalid CSV

        try {
            await validateCSVAndStoreCSV(filePath);
        } catch (error) {
            expect(error.error).to.equal('Validation errors found');
            expect(error.failedRecords).to.equal(1);
            expect(error.failureReasons).to.include('Invalid date format in row 1');
            expect(error.failureReasons).to.include("Invalid number in field 'Prev Close' in row 1");
        }

        await fs.unlink(filePath); // Clean up mock file
    });

    it('should reject if required columns are missing', async () => {
        const incompleteCSVContent = `Date,Symbol,Open,High,Low,Close\n2024-01-01,ABC,101,102,99,102`;
        const filePath = path.resolve('incomplete.csv');
        await fs.writeFile(filePath, incompleteCSVContent);

        try {
            await validateCSVAndStoreCSV(filePath);
        } catch (error) {
            expect(error.message).to.include('Missing columns');
        }

        await fs.unlink(filePath); // Clean up mock file
    });

    it('should reject if no file is uploaded', async () => {
        try {
            await validateCSVAndStoreCSV('');
        } catch (error) {
            expect(error.error).to.equal('Validation errors found');
        }
    });
});
