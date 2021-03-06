import alasql from "alasql";
import {getConstraintTablesConstraintKeyName, isTableVisible} from "./Utils";

class SqlManager {

    constructor(tablesInfo) {
        this.initialiseAlasqlTables(tablesInfo);
        this.firstTable = this.getFirstTable(tablesInfo);
        this.tableRelationships = this.getTableRelationships(tablesInfo);
        this.constraintTableConstraintKeyNames = getConstraintTablesConstraintKeyName(tablesInfo);
        this.cache = new Map();
    }

    initialiseAlasqlTables(tablesInfo) {
        tablesInfo.forEach(function (t) {
            // Create table
            let sql = "CREATE TABLE " + t['tableName'];
            // console.log(sql);
            alasql(sql);
            // Create index
            if (t['options']['pk'] !== undefined) {
                sql = "CREATE UNIQUE INDEX tmp ON " + t['tableName'] + "(" + t['options']['pk'] + ")";
                // console.log(sql);
                alasql(sql);
            }
            // Add data
            alasql.tables[t['tableName']].data = t['tableData'];
        });
    }

    clearAlasqlTables(tablesInfo) {
        tablesInfo.forEach(function (t) {
            alasql('DELETE FROM ' + t['tableName']);
        });
    }

    addNewData(tablesInfo) {
        tablesInfo.forEach(t => alasql.tables[t['tableName']].data = t['tableData']);
    }

    getFieldNames(tablesInfo) {
        return tablesInfo
            .filter(isTableVisible)
            .map(tableInfo => ({'tableName': tableInfo['tableName'], 'firstDataRow': tableInfo['tableData'][0]}))
            .map(tableData => Object.keys(tableData['firstDataRow'])
                .map(e => tableData['tableName'] + "." + e + " AS " + tableData['tableName'] + "_" + e))
            .reduce((fieldNamesArray, fieldNames) => fieldNamesArray.concat(fieldNames), [])
            .join(", ");
    }

    assembleInnerJoinStatementFromRelationship(relationship) {
        // debugger;
        function parseRelationship(r) {
            if (r['with']) {
                return "INNER JOIN " + r['with'] + " ON " + r['tableName'] + "." + r['using'] + " = " + r['with'] + "." + r['using'] + " ";
            } else {
                return "";
            }
        }

        let rs = undefined;
        if (relationship.constructor === Array) {
            rs = relationship; // an array of multiple relationships
        } else {
            rs = [relationship] // create an array of just one relationship
        }

        // process each relationship to make the final statement
        let innerJoinStatement = "";
        rs.forEach(function (r, i) {
            innerJoinStatement += parseRelationship(r);
        });
        return innerJoinStatement;
    }

    makeSelectClause(tablesInfo) {
        // Join each field into a select clause
        const fieldNames = this.getFieldNames(tablesInfo);
        // put the first table in the from clause
        const selectClause = "SELECT " + fieldNames + " FROM " + this.firstTable;
        return selectClause;
    }

    makeInnerJoinClause() {
        return this.tableRelationships
            .map(this.assembleInnerJoinStatementFromRelationship.bind(this))
            .join(" ");
    }

    getFirstTable(tablesInfo) {
        return tablesInfo[0]['tableName'];
    }

    getRelationship(tableInfo) {
        // debugger;
        function parseRelationship(r) {
            let parsed = {'tableName': tableInfo['tableName'], 'with': r['with'], 'using': r['using']};
            return parsed;
        }

        if (tableInfo['relationship']) {
            if (tableInfo['relationship'].constructor == Array) {
                // relationship is a list of dicts
                return tableInfo['relationship'].map(r => parseRelationship(r));
            } else {
                // relationship is a single dict
                return {
                    'tableName': tableInfo['tableName'],
                    'with': tableInfo['relationship']['with'],
                    'using': tableInfo['relationship']['using']
                }
            }
        } else {
            return {'tableName': tableInfo['tableName']};
        }
        ;
    }

    getTableRelationships(tablesInfo) {
        return tablesInfo
            .map(this.getRelationship);
    }

    getTableKeys() {
        // Returns the table name and the name of the key used in the where clause
        return this.tableRelationships
            .map(t => JSON.stringify({'tableName': t['tableName'], 'tableKey': t['using']}))
            .filter((tk, idx, tka) => tka.indexOf(tk) === idx)
            .map(t => JSON.parse(t));
    }

    makeSQLquery(tablesInfo, skipConstraints, whereType) {
        const selectClause = this.makeSelectClause(tablesInfo);
        const innerJoinClause = this.makeInnerJoinClause();
        const whereClause = this.makeWhereClause(tablesInfo, skipConstraints, whereType);
        return [selectClause, innerJoinClause, whereClause].join(" ");
    }

    makeWhereClause(tablesInfo, skipConstraints, whereType) {
        // add WHERE condition based on selected pks
        const whereSubClauses = this.makeWhereSubClauses();
        let selectedWhereSubClauses = [];
        whereSubClauses.forEach(function (value, i) {
            if (!skipConstraints[i]) {
                selectedWhereSubClauses.push(whereSubClauses[i] + ' IN @(?)');
            }
        });

        // add WHERE condition based on query builder for significant items
        // const whereSubClauses2 = this.constraintTableConstraintKeyNames
        //     .map(t => t['tableName'] + "." + whereType + "=TRUE").join(" OR ");
        let whereSubClauses2 = null;
        if (whereType) {
            // padjRules: the selected column is significant (above > 0.05)
            const padjOperators = ['less_or_equal'];
            const padjRules = whereType.rules.filter(rule => rule.type === 'double' && padjOperators.includes(rule.operator));

            // fcRules: the selected column has a fold change value in the range
            const fcOperators = ['less_or_equal', 'greater_or_equal', 'between', 'not_between'];
            const fcRules = whereType.rules.filter(rule => rule.type === 'double' && fcOperators.includes(rule.operator));

            // convert rules to SQL conditions
            const padjConditions = padjRules.map(rule => {
                if (rule.operator === 'less_or_equal') {
                    return `${rule.id} <= ${rule.value}`;
                }
                return '';
            });

            const fcConditions = fcRules.map(rule => {
                if (rule.operator === 'less_or_equal') {
                    return `${rule.id} <= ${rule.value}`;
                } else if (rule.operator === 'greater_or_equal') {
                    return `${rule.id} >= ${rule.value}`;
                } else if (rule.operator === 'between') {
                    return `${rule.id} BETWEEN ${rule.value[0]} AND ${rule.value[1]}`;
                } else if (rule.operator === 'not_between') {
                    return `${rule.id} NOT BETWEEN ${rule.value[0]} AND ${rule.value[1]}`;
                }
                return '';
            });

            // generate the SQL statement
            if (padjRules.length > 0 && fcRules.length > 0) { // both
                whereSubClauses2 = padjConditions.join(' AND ') + ' AND ' + fcConditions.join(' AND ');
            } else if (padjRules.length > 0) { // only padj
                whereSubClauses2 = padjConditions.join(' AND ');
            } else if (fcRules.length > 0) { // only FC
                whereSubClauses2 = fcConditions.join(' AND ');
            }

        }

        // combine whereSubClauses1 and whereSubClauses2
        if (selectedWhereSubClauses.length > 0) {
            const whereSubClauses1 = selectedWhereSubClauses.join(' AND ');
            if (whereType) {
                return 'WHERE (' + whereSubClauses1 + ') AND (' + whereSubClauses2 + ')';
            } else {
                return 'WHERE ' + whereSubClauses1;
            }
        } else {
            if (whereType) {
                return 'WHERE ' + whereSubClauses2;
            } else {
                return '';
            }
        }
    }

    makeWhereSubClauses() {
        return this.constraintTableConstraintKeyNames
            .map(t => t['tableName'] + "." + t['constraintKeyName'])
    }

    makeSignificantFilterSQLquery(tablesInfo, whereType) {
        const selectClause = this.makeSelectClause(tablesInfo);
        const innerJoinClause = this.makeInnerJoinClause();
        const whereClause = this.makeSignificantWhereClause(tablesInfo, whereType);
        return [selectClause, innerJoinClause, whereClause].join(" ");
    }

    makeSignificantWhereClause(tablesInfo, whereType) {
        if (whereType) {
            const whereSubClauses = this.constraintTableConstraintKeyNames
                .map(t => t['tableName'] + "." + whereType + "=TRUE");
            const whereClauses = "WHERE " + whereSubClauses.join(" OR ");
            return whereClauses;
        } else {
            return "";
        }
    }

    // https://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript
    cyrb53(str, seed = 0) {
        let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
        for (let i = 0, ch; i < str.length; i++) {
            ch = str.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        return 4294967296 * (2097151 & h2) + (h1 >>> 0);
    }

    queryDatabase(tablesInfo, constraints, whereType) {

        const constraintTableNames = this.constraintTableConstraintKeyNames.map(t => t['tableName']);
        const unpackedConstraints = constraintTableNames.map(n => constraints[n]);
        // console.log("unpackedConstraints.length = " + unpackedConstraints.length);
        let skipConstraints = [];
        let selectedConstraints = []
        unpackedConstraints.forEach(function (uc, i) {
            // find myTable matching by name
            let tableName = constraintTableNames[i];
            let myTable = tablesInfo.filter(t => t['tableName'] === tableName)[0];

            // if the where subClause includes ALL the data of that table, then skip it
            let sc = false
            if (uc.length == 0 || uc.length == myTable['tableData'].length) {
                sc = true;
            }
            if (!sc) {
                selectedConstraints.push(uc);
            }
            skipConstraints.push(sc);
            // console.log('%d. skip %s (%s)', i, sc, uc);
        });

        const sqlQuery = this.makeSQLquery(tablesInfo, skipConstraints, whereType);

        // attempt to cache expensive queries
        const constraintString = selectedConstraints.flat().sort().join();
        const keyStr = sqlQuery.concat(' -- ', constraintString);
        const key = this.cyrb53(keyStr);
        let queryResult = undefined;
        if (this.cache.has(key)) {
            console.log('Cached:', key);
            queryResult = this.cache.get(key);
        } else {
            console.log('Query:', key);
            const compiledSQLQuery = alasql.compile(sqlQuery);
            queryResult = compiledSQLQuery(selectedConstraints);
            this.cache.set(key, queryResult);
        }
        return {
            'queryResults': queryResult,
            'key': key
        };
    }

    prefixQuery(tableFieldNames, dataSource, dataSourceKey) {
        const tableName = tableFieldNames['tableName'];
        const prefix = tableName + '_';
        const fieldNames = tableFieldNames['fieldNames'].map(x => prefix + x);
        const sqlQuery = "SELECT DISTINCT " + fieldNames.join(", ") + " FROM ?";

        // attempt to cache expensive queries
        const keyStr = sqlQuery.concat(' -- ', dataSourceKey);
        const key = this.cyrb53(keyStr);
        let queryResult = undefined;
        if (this.cache.has(key)) {
            console.log('Cached:', key);
            queryResult = this.cache.get(key);
        } else {
            console.log('Query:', key);
            queryResult = alasql(sqlQuery, [dataSource]);

            queryResult.map(x => { // for each row in the sql results
                Object.keys(x).map(key => { // rename the properties to remove the table name in front
                    const newkey = key.replace(prefix, '');
                    x[newkey] = x[key];
                    delete (x[key]);
                });
            });
            this.cache.set(key, queryResult);
        }
        return queryResult;
    }

}

export default SqlManager;