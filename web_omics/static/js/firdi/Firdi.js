import 'datatables.net';
import 'datatables.net-dt/css/jquery.dataTables.css';
import 'datatables.net-buttons';
import 'datatables.net-buttons-dt/css/buttons.dataTables.min.css';
import 'datatables.net-buttons/js/buttons.colVis.js'; // Column visibility
import 'datatables.net-responsive';
import 'datatables.net-responsive-dt/css/responsive.dataTables.min.css';
import 'datatables.net-scroller';
import 'datatables.net-scroller-dt/css/scroller.dataTables.min.css';
import 'datatables.net-select';
import 'datatables.net-select-dt/css/select.dataTables.min.css';

import alasql from 'alasql';

import {
    blockUI,
    CLUSTERGRAMMER_UPDATE_EVENT,
    deepCopy,
    SELECTION_MANAGER_UPDATE_EVENT,
    unblockUI
} from '../common';
import DataTablesOptionsManager from './DataTablesOptionsManager';
import ConstraintsManager from './ConstraintsManager';
import {getPkCol, getPkValue, getRowObj, isTableVisible} from "./Utils";


class Firdi {

    constructor(sqlManager, infoPanelManager, tablesInfo, tableFields, state) {
        this.tablesInfo = tablesInfo;
        this.originalTablesInfo = deepCopy(tablesInfo);
        this.sqlManager = sqlManager;
        this.infoPanelManager = infoPanelManager;

        this.state = state;
        this.state.on(CLUSTERGRAMMER_UPDATE_EVENT, (data) => {
            console.log('firdi receives update from clustergrammer');
            console.log(data);
            const tableName = data.cgmLastClickedName;
            const selectedPkValues = data.selections[tableName];
            this.resetFiRDI(true);
            this.multipleTrClickHandlerUpdate(tableName, selectedPkValues);
        })
        this.state.on(SELECTION_MANAGER_UPDATE_EVENT, (data) => {
            console.log('firdi receives update from selection manager');
            console.log(data);
            this.resetFiRDI(false);
            this.updateFiRDIForLoadSelection();
        })

        const dataTablesOptionsManager = new DataTablesOptionsManager(tablesInfo, tableFields);
        this.constraintsManager = new ConstraintsManager(this.tablesInfo, this.sqlManager, this.state);
        this.tableFieldNames = this.getFieldNames();
        this.dataTablesIds = this.getDataTableIds(tablesInfo);

        this.initTableClicks();
        this.initSignificantFilters();
        this.initSearchBox();
    }

    getDataTableIds(tablesInfo) {
        return tablesInfo.filter(isTableVisible).reduce((apis, t) => {
            apis[t['tableName']] = "#" + t['tableName'];
            return apis
        }, {});
    }

    initTableClicks() {
        const dataTablesIdsKeys = Object.keys(this.dataTablesIds);
        dataTablesIdsKeys.forEach(id => $(this.dataTablesIds[id]).DataTable().on('user-select', this.trClickHandler.bind(this)));
    }

    initSignificantFilters() {
        const currObj = this;
        const filterTableFunc = function () {
            blockUI();
            const selectedValue = this.value;
            window.setTimeout(function () {
                currObj.resetFiRDI(true);
                let filterColumnName = selectedValue.length > 0 ? selectedValue : null;
                currObj.state.whereType = filterColumnName;
                currObj.updateTables();
                currObj.state.notifyFirdiUpdate();
                unblockUI();
            }, 1); // we need a small delay to allow blockUI to be rendered correctly
        };
        $('input[type=radio][name=inlineRadioOptions]').change(filterTableFunc);
    }

    initSearchBox() {
        $('#global_filter').on('keyup click', function () {
            const val = $('#global_filter').val();
            $.fn.dataTable.tables({api: true}).search(val).draw();
        });
    }

    resetFiRDI(resetState) {
        // restore originalTablesInfo
        this.tablesInfo = JSON.parse(JSON.stringify(this.originalTablesInfo));
        this.sqlManager.clearAlasqlTables(this.tablesInfo);
        this.sqlManager.addNewData(this.tablesInfo);
        this.tablesInfo.forEach(t => {
            const tableName = t['tableName'];
            const tableAPI = $(this.dataTablesIds[tableName]).DataTable();
            tableAPI.clear();
            tableAPI.rows.add(t['tableData']);
            tableAPI.draw();
        });
        // reset state
        if (resetState) {
            this.state.defaultConstraints = this.getDefaultConstraints();
            this.state.constraints = deepCopy(this.state.defaultConstraints);
            this.state.selections = this.makeEmptyConstraint();
            this.state.numSelected = this.makeEmptyCount();
            this.state.totalSelected = 0;
            this.state.whereType = null;
        }
        // reset info panels
        this.infoPanelManager.clearAllInfoPanels();
    }

    getFieldNames() {
        // Gets the field names for each visible table
        return this.tablesInfo
            .filter(isTableVisible)
            .map(tableInfo => ({
                'tableName': tableInfo['tableName'],
                'fieldNames': Object.keys(tableInfo['tableData'][0])
            }));
    }

    prefixQuery(tableFieldNames, dataSource) {
        const tableName = tableFieldNames['tableName'];
        const prefix = tableName + '_';
        const fieldNames = tableFieldNames['fieldNames'].map(x => prefix + x);

        const sqlStatement = "SELECT DISTINCT " + fieldNames.join(", ") + " FROM ?";
        const temp = alasql(sqlStatement, [dataSource]);

        temp.map(x => { // for each row in the sql results
            Object.keys(x).map(key => { // rename the properties to remove the table name in front
                const newkey = key.replace(prefix, '');
                x[newkey] = x[key];
                delete (x[key]);
            });
        });

        return temp;
    }

    updateTables() {
        console.log('queryResult');
        const queryResult = this.sqlManager.queryDatabase(this.tablesInfo, this.state.constraints,
            this.state.whereType);

        for (let i = 0; i < this.tableFieldNames.length; i++) { // update all the tables
            const tableFieldName = this.tableFieldNames[i];
            const tableName = tableFieldName['tableName'];
            this.updateSingleTable(tableFieldName, queryResult);
        }
    }

    updateTablesForClickUpdate() {
        if (this.state.totalSelected > 0) {

            console.log('queryResult');
            const queryResult = this.sqlManager.queryDatabase(this.tablesInfo, this.state.constraints,
                this.state.whereType);

            for (let i = 0; i < this.tableFieldNames.length; i++) { // update all the tables
                const tableFieldName = this.tableFieldNames[i];
                const tableName = tableFieldName['tableName'];
                if (this.state.numSelected[tableName] > 0) { // if table already has some selection
                    // don't change table content, just change the selection style
                    this.addSelectionStyle(tableName);
                } else {
                    // otherwise update table content and selection style
                    this.updateSingleTable(tableFieldName, queryResult);
                    this.addSelectionStyle(tableName);
                }
            }

        } else {
            this.resetTables();
        }
        this.state.notifyFirdiUpdate();
    }

    updateSingleTable(tableFieldName, queryResult) {
        const tableName = tableFieldName['tableName'];
        const data = this.prefixQuery(tableFieldName, queryResult);
        $(this.dataTablesIds[tableName]).DataTable().clear();
        $(this.dataTablesIds[tableName]).DataTable().rows.add(data);
        $(this.dataTablesIds[tableName]).DataTable().draw();
        // store the last query results for updates in other views later
        this.state.lastQueryResults[tableName] = data;
    }

    addSelectionStyle(tableName) {
        const tableAPI = $(this.dataTablesIds[tableName]).DataTable();
        const tableSelections = this.state.selections[tableName];

        if (tableSelections.length > 0) {

            // redraw all pages .. slow!!
            // for (let i = 0; i < tableAPI.page.info().pages; i++) {
            //     tableAPI.page(i).draw('page');
            // }

            // Find page that contains the row of interest
            // Go to it
            // add selection to that row.
            const pages = [];
            for (let i = 0; i < tableSelections.length; i++) {
                const selection = tableSelections[i];
                // const found = getRowObj(tableName, selection.idVal, indexToPos, selection.rowIndex);
                const found = getRowObj(tableName, selection.idVal);
                const rowIndex = found.rowIndex;
                const pageInfo = tableAPI.page.info();
                const thePage = Math.floor(rowIndex / pageInfo['length']);
                pages.push(thePage);
            }

            // draw the page once because of defer_render
            // https://datatables.net/examples/ajax/defer_render.html
            this.drawPages(tableAPI, tableName, pages);

            // add selection styles
            for (let i = 0; i < tableSelections.length; i++) {
                const selection = tableSelections[i];
                // const found = getRowObj(tableName, selection.idVal, indexToPos, selection.rowIndex);
                const found = getRowObj(tableName, selection.idVal);
                const node = found.node;
                if (node.length > 0) {
                    if (!node.hasClass('selected')) {
                        node.addClass('selected');
                    }
                }
            }

            // draw pages again to show the selection styles
            this.drawPages(tableAPI, tableName, pages);
        }
    }

    drawPages(tableAPI, tableName, pages) {
        var uniquePages = Array.from(new Set(pages));
        // console.trace('uniquePages', tableName, uniquePages);
        for (let i = 0; i < uniquePages.length; i++) {
            const thePage = uniquePages[i];
            tableAPI.page(thePage).draw('page');
        }
    }

    removeSelectionStyle(targetTr) {
        if (targetTr.hasClass('selected')) {
            targetTr.removeClass('selected');
        }
    }

    resetTable(tableFieldNames, queryResult) {
        const tableName = tableFieldNames['tableName'];
        const data = this.prefixQuery(tableFieldNames, queryResult);
        const tableAPI = $(this.dataTablesIds[tableName]).DataTable();
        tableAPI.clear();
        tableAPI.rows.add(data);
        tableAPI.draw();
        tableAPI.page(0).draw('page');
        this.state.lastQueryResults[tableName] = data;
    }

    resetTables() {
        console.log('resetTable');
        const queryResult = this.sqlManager.queryDatabase(this.tablesInfo, this.state.constraints,
            this.state.whereType);
        this.tableFieldNames.forEach(tableFieldNames => this.resetTable(tableFieldNames, queryResult));
    }

    trClickHandler(e, dt, type, cell, originalEvent) {
        e.preventDefault();
        blockUI();
        const obj = this;
        window.setTimeout(function () {

            // clear search result
            $('#global_filter').val('');
            $.fn.dataTable.tables({api: true}).search('');

            // find the selected row
            const tableName = e.currentTarget.id;
            const tableAPI = $(obj.dataTablesIds[tableName]).DataTable();
            const targetTr = $(originalEvent.target).closest('tr');
            const row = tableAPI.row(targetTr);
            const rowData = row.data();
            const rowIndex = tableAPI.rows()[0].indexOf(row.index());
            const anyRowSelected = tableAPI.rows('.selected').any();

            obj.trClickHandlerUpdate(tableName, targetTr, rowData, rowIndex, anyRowSelected);
            unblockUI();
            // update the related info panel for this table, if any
            if (obj.state.numSelected[tableName] > 0) {

                // assume that entries in the array is always in sorted order by their row index
                // (the sorting is done upon insertion in addConstraint)
                const selections = obj.state.selections[tableName];

                // find the pk value that has been clicked and its index in selections
                const selectedValue = getPkValue(rowData, tableName);
                let selectedIndex = selections.map(x => x.idVal).indexOf(selectedValue);
                let updatePage = true;
                if (selectedIndex == -1 && selections.length > 0) { // if the current row has been unclicked
                    // update the bottom panel to show the first item in selections,
                    // but don't change the current page in the datatable
                    selectedIndex = 0;
                    updatePage = false;
                }
                obj.infoPanelManager.updateEntityInfo(tableName, selections, selectedIndex, updatePage);

                // store for use in buttons etc later
                obj.state.selectedIndex[tableName] = selectedIndex;

            } else {
                obj.infoPanelManager.clearInfoPanel(tableName);
            }
        }, 1); // we need a small delay to allow blockUI to be rendered correctly
    }

    trClickHandlerUpdate(tableName, targetTr, rowData, rowIndex, anyRowSelected) {
        // if some rows are already selected in the table
        if (anyRowSelected) {
            // if the current row is already selected then unselect it
            if (targetTr.hasClass('selected')) {
                this.constraintsManager.removeConstraint(tableName, rowData);
                this.removeSelectionStyle(targetTr);
                this.updateTablesForClickUpdate();
            } else { // otherwise select the current row
                this.constraintsManager.addConstraint(tableName, rowData, rowIndex);
                this.updateTablesForClickUpdate();
            }
        } else { // otherwise just select this row
            this.constraintsManager.addConstraint(tableName, rowData, rowIndex);
            this.updateTablesForClickUpdate();
        }
    }

    multipleTrClickHandlerUpdate(tableName, selectedPkValues) {
        // we need to repopulate the constraints based on selectedPkValues
        // first find rows in the datatable based on selectedPkValues
        const tableAPI = $('#' + tableName).DataTable();
        const pkCol = getPkCol(tableName);
        const rows = tableAPI.rows((idx, data, node) => {
            const pk = data[pkCol];
            return selectedPkValues.includes(pk) ? true : false;
        });
        const allRowData = rows.data();
        const allRowIndices = rows.indexes();

        // add rows as multiple selections
        // here we assume that state has been reset (resetFiRDI was called)
        for (let i = 0; i < selectedPkValues.length; i++) {
            const rowData = allRowData[i];
            const rowIndex = allRowIndices[i];
            this.constraintsManager.addConstraint(tableName, rowData, rowIndex);
        }

        // refresh UI based on multiple selections
        this.updateFiRDIForMultipleSelect(tableName);
    }

    updateFiRDIForMultipleSelect(tableName) {
        // query db based on multiple selections
        console.log('queryResult');
        const queryResult = this.sqlManager.queryDatabase(this.tablesInfo, this.state.constraints,
            this.state.whereType);

        // add selected class to the rows in selection
        this.addSelectionStyle(tableName);

        // update table content and selection style
        for (let i = 0; i < this.tableFieldNames.length; i++) { // update all the tables
            const tableFieldName = this.tableFieldNames[i];
            const tName = tableFieldName['tableName'];
            if (tName !== tableName) { // if table name is not the one with multiple selections
                // update table content
                this.updateSingleTable(tableFieldName, queryResult);
            }
        }

        // update bottom panel
        this.state.selectedIndex[tableName] = 0;
        const selections = this.state.selections[tableName];
        const selectedIndex = 0;
        const updatePage = true;
        this.infoPanelManager.updateEntityInfo(tableName, selections, selectedIndex, updatePage);
    }

    updateFiRDIForLoadSelection() {
        // query db based on multiple selections
        console.log('queryResult');
        const queryResult = this.sqlManager.queryDatabase(this.tablesInfo, this.state.constraints,
            this.state.whereType);

        // update table content and selection style
        for (let i = 0; i < this.tableFieldNames.length; i++) { // update all the tables
            const tableFieldName = this.tableFieldNames[i];
            const tableName = tableFieldName['tableName'];

            const selectedPkValues = this.state.selections[tableName];
            if (selectedPkValues.length > 0) {
                // add selected class to the rows in selection
                this.addSelectionStyle(tableName);

                // update bottom panel
                this.state.selectedIndex[tableName] = 0;
                const selections = this.state.selections[tableName];
                const selectedIndex = 0;
                const updatePage = true;
                this.infoPanelManager.updateEntityInfo(tableName, selections, selectedIndex, updatePage);
            } else { // if no selection, then just update the table values based on query result
                this.updateSingleTable(tableFieldName, queryResult);
            }
        }

    }

}

export default Firdi;