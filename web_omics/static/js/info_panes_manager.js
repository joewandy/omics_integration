import { getRowObj, goToPage } from './common'

class InfoPanesManager {

    constructor(viewNames) {
        this.viewNames = viewNames;

        // hide all buttons initially
        const buttonIds = [
            'gene-previous',
            'protein-previous',
            'compound-previous',
            'reaction-previous',
            'pathway-previous',
            'gene-next',
            'protein-next',
            'compound-next',
            'reaction-next',
            'pathway-next'
        ];
        buttonIds.forEach(x => $(`#${x}`).hide());

        // to track the current selections for each table
        this.selections = {};
        this.selectedIndex = {};
        this.initNextPrevButtons()
    }

    initNextPrevButtons() {
        const currObj = this;
        const handlePrevFunc = (tableName) => {
            const selections = currObj.selections[tableName];
            const selectedIndex = currObj.selectedIndex[tableName]-1;
            currObj.updateEntityInfo(tableName, selections, selectedIndex);
            currObj.selections[tableName] = selections;
            currObj.selectedIndex[tableName] = selectedIndex;
        }
        const handleNextFunc = (tableName) => {
            const selections = currObj.selections[tableName];
            const selectedIndex = currObj.selectedIndex[tableName]+1;
            currObj.updateEntityInfo(tableName, selections, selectedIndex);
            currObj.selections[tableName] = selections;
            currObj.selectedIndex[tableName] = selectedIndex;
        }

        $('#gene-previous').on('click', () => { handlePrevFunc('genes_table'); });
        $('#protein-previous').on('click', () => { handlePrevFunc('proteins_table'); });
        $('#compound-previous').on('click', () => { handlePrevFunc('compounds_table'); });
        $('#reaction-previous').on('click', () => { handlePrevFunc('reactions_table'); });
        $('#pathway-previous').on('click', () => { handlePrevFunc('pathways_table'); });

        $('#gene-next').on('click', () => { handleNextFunc('genes_table'); });
        $('#protein-next').on('click', () => { handleNextFunc('proteins_table'); });
        $('#compound-next').on('click', () => { handleNextFunc('compounds_table'); });
        $('#reaction-next').on('click', () => { handleNextFunc('reactions_table'); });
        $('#pathway-next').on('click', () => { handleNextFunc('pathways_table'); });

    }

    clearInfoPane(tableId) {
        // Wrapper function to call the appropriate info function for the given table/entity
        if (tableId === 'genes_table') {
            this.clearInfoPanel('gene-row-info', 'Gene Information');
        } else if (tableId === 'proteins_table') {
            this.clearInfoPanel('protein-row-info', 'Protein Information');
        } else if (tableId === 'compounds_table') {
            this.clearInfoPanel('compound-row-info', 'Compound Information');
        } else if (tableId === 'reactions_table') {
            this.clearInfoPanel('reaction-row-info', 'Reaction Information');
        } else if (tableId === 'pathways_table') {
            this.clearInfoPanel('pathway-row-info', 'Pathway Information');
        }
    }

    clearAllInfoPanes() {
        this.clearInfoPanel('gene-row-info', 'Gene Information');
        this.clearInfoPanel('protein-row-info', 'Protein Information');
        this.clearInfoPanel('compound-row-info', 'Compound Information');
        this.clearInfoPanel('reaction-row-info', 'Reaction Information');
        this.clearInfoPanel('pathway-row-info', 'Pathway Information');
    }

    updateEntityInfo(tableId, selections, selectedIndex) {
        const selectedValue = selections[selectedIndex].idVal;
        const rowObject = getRowObj(tableId, selectedValue);
        goToPage(rowObject);

        // call the appropriate info function for the given table/entity
        const viewUrl = this.viewNames[tableId];
        if (tableId === 'genes_table') {
            this.updateInfoPanel(tableId, rowObject, viewUrl,
                'gene-row-info',
                'gene-title', 'gene-previous', 'gene-next', selections, selectedIndex);
        } else if (tableId === 'proteins_table') {
            this.updateInfoPanel(tableId, rowObject, viewUrl,
                'protein-row-info',
                'protein-title', 'protein-previous', 'protein-next', selections, selectedIndex);
        } else if (tableId === 'compounds_table') {
            this.updateInfoPanel(tableId, rowObject, viewUrl,
                'compound-row-info',
                'compound-title',  'compound-previous', 'compound-next', selections, selectedIndex);
        } else if (tableId === 'reactions_table') {
            this.updateInfoPanel(tableId, rowObject, viewUrl,
                'reaction-row-info',
                'reaction-title', 'reaction-previous', 'reaction-next', selections, selectedIndex);
        } else if (tableId === 'pathways_table') {
            this.updateInfoPanel(tableId, rowObject, viewUrl,
                'pathway-row-info',
                'pathway-title', 'pathway-previous', 'pathway-next', selections, selectedIndex);
        }
    }

    getPkValue(rowObject, tableId) {
        if (tableId === 'genes_table') {
            return rowObject['gene_pk'];
        } else if (tableId === 'proteins_table') {
            return rowObject['protein_pk'];
        } else if (tableId === 'compounds_table') {
            return rowObject['compound_pk'];
        } else if (tableId === 'reactions_table') {
            return rowObject['reaction_pk'];
        } else if (tableId === 'pathways_table') {
            return rowObject['pathway_pk'];
        }
        return null;
    }

    getDisplayName(rowObject, tableId) {
        if (tableId === 'genes_table') {
            return rowObject['gene_id'];
        } else if (tableId === 'proteins_table') {
            return rowObject['protein_id'];
        } else if (tableId === 'compounds_table') {
            return rowObject['compound_id'];
        } else if (tableId === 'reactions_table') {
            return rowObject['reaction_id'];
        } else if (tableId === 'pathways_table') {
            return rowObject['pathway_id'];
        }
        return null;
    }

    updateInfoPanel(tableId, rowObject, dataUrl, rowId,
                    titleId, titlePrevId, titleNextId, selections, selectionIndex) {
        const rowData = rowObject.data;
        const displayNameCol = this.getDisplayName(rowObject, tableId);
        this.clearInfoPanel(rowId);
        if (rowData[displayNameCol] !== '-') {
            this.updateTitle(rowData, titleId, titlePrevId, titleNextId, selections, selectionIndex)
            this.updateContent(rowData, tableId, dataUrl, rowId);
        } else {
            const selector = '#' + rowId;
            $(selector).text('Select an entry above.');
        }
    }

    updateTitle(rowObject, titleId, titlePrevId, titleNextId, selections, selectionIndex) {
        const selectionLength = selections.length;
        const updatedTitle = `${selectionIndex+1}/${selectionLength}`;
        $(`#${titleId}`).text(updatedTitle);
        // hide previous button if necessary
        if (selectionIndex == 0) {
            $(`#${titlePrevId}`).hide();
        } else {
            $(`#${titlePrevId}`).show();
        }
        // hide next button if necessary
        if (selectionIndex+1 == selectionLength) {
            $(`#${titleNextId}`).hide();
        } else {
            $(`#${titleNextId}`).show();
        }
    }

    updateContent(rowObject, tableId, dataUrl, rowId) {
        const tableData = {
            'id': this.getPkValue(rowObject, tableId)
        };
        const displayName = this.getDisplayName(rowObject, tableId);
        let infoDiv = $('<div/>');
        let infoTitle = $('<h6/>', {
            'text': displayName
        });
        infoDiv.append(infoTitle);

        let dataDiv = $('<div\>', {
            'html': '<p>Loading data...</p>'
        });
        $.getJSON(dataUrl, tableData, data => {
            const annotation = data['annotation'];
            const annotationUrl = data['annotation_url'];
            const annotationId = data['annotation_id'];
            const annotationLink = '<button type="button" class="btn btn-outline-primary btn-sm" style="margin-left: 5px"' +
                `onclick="annotate('${annotationId}', '${annotationUrl}', '${displayName}')">📝</button>`;
            infoTitle.append(annotationLink);

            let annotationHtml = '';
            if (annotation.length > 0) {
                annotationHtml = `<p><strong>Annotation</strong>: ${annotation}</p>`
            }
            const annotationDiv = $('<div\>', {
                id: `annotation-${annotationId}`,
                html: annotationHtml,
                class: 'annotation'
            });
            infoDiv.append(annotationDiv);

            // loop over additional information
            let infos = data['infos'];
            for (let item of infos) {
                const key = item.key;
                const val = item.value + ''; // ensure that val is always a string
                const url = item.url;
                if (val.includes((';'))) {
                    let html = `<p><strong>${key}</strong>:</p><ul>`;
                    const tokens = val.split(';').map(x => x.trim());
                    if (url) {
                        const links = url.split(';').map(x => x.trim());
                        for (let i = 0; i < tokens.length; i++) {
                            html += `<li><a href="${links[i]}" target="_blank">${tokens[i]}</a></li>`;
                        }
                    } else { // no url
                        for (let w of tokens) {
                            html += `<li>${w}</li>`;
                        }
                    }
                    html += '</ul>';
                    infoDiv.append(html);
                } else {
                    infoDiv.append(`<p><strong>${key}</strong>: ${val}</p>`);
                }
            }

            // loop over external links
            dataDiv.empty();
            let links = data['links'];
            for (let link of links) {
                let newLink = $('<p/>').append($('<a/>', {
                    'href': link.href,
                    'text': link.text,
                    'target': '_blank'
                }));
                dataDiv.append(newLink);
            }

            // loop over images
            function isImageUrl(url) {
                return (url.match(/\.(jpeg|jpg|gif|png)$/) != null) || url.includes('chebi');
            }

            let images = data['images'];
            for (let item of images) {
                if (isImageUrl(item)) {
                    let newImage = $('<img/>', {
                        'src': item,
                        'class': 'img-fluid'
                    });
                    dataDiv.append(newImage);
                } else if (item.includes('reactome')) { // handle reactome images
                    let newLink = $('<a/>', {
                        'href': item + "&quality=7",
                        'target': '_blank'
                    }).append(
                        $('<img/>', {
                            'src': item + "&quality=3",
                            'class': 'img-fluid'
                        })
                    );
                    dataDiv.append(newLink);
                }
            }

            // plot intensities here
            const plotData = data['plot_data']
            if (data.hasOwnProperty('plot_data')) {
                let plotDiv = document.createElement('div');
                let d3_intensity_chart_load_btn = $('<button/>', {
                    'class': 'btn btn-sm btn-outline-primary',
                    'text': 'Show measurements',
                    'css': {
                        'margin-top': '10px'
                    }
                });
                dataDiv.append(d3_intensity_chart_load_btn);
                dataDiv.append(plotDiv);
                this.plotPeakIntensitySamples(plotDiv, plotData);

                let $_plotDiv = $(plotDiv);
                $_plotDiv.hide();
                d3_intensity_chart_load_btn.click(function () {
                    $_plotDiv.toggle('fast');
                });
            }

        });

        const selector = '#' + rowId;
        $(selector).empty();
        $(selector).append(infoDiv);
        $(selector).append(dataDiv);
    }

    clearInfoPanel(rowId) {
        let content = $('<p/>', {
            'text': 'Select an entry above.'
        });
        const selector = '#' + rowId;
        $(selector).empty().append(content);
    }

    plotPeakIntensitySamples(plotDiv, data) { // slightly modified from ross' pimp_quick_results_firdi.js
      var dataStore = [];
        // console.log(data);
        var maxOverallIntensity = 0,
            attributes = Object.keys(data);

        attributes.forEach(function(attribute, i) {
          var attributeSamples = data[attribute],
              intensities = d3.values(attributeSamples),
              sampleNames = Object.keys(attributeSamples),
              maxAttributeIntensity = d3.max(intensities),
              sortedIntensities = d3.values(attributeSamples).sort(d3.ascending),
              boxPlotStatistics = {
                lowerquantile: d3.quantile(sortedIntensities, 0.25),
                median: d3.quantile(sortedIntensities, 0.5),
                upperquantile: d3.quantile(sortedIntensities, 0.75),
                mini: d3.min(sortedIntensities),
                maxi: d3.max(sortedIntensities)
              },
              points = [];

          maxOverallIntensity = (maxOverallIntensity > maxAttributeIntensity ? maxOverallIntensity : maxAttributeIntensity);

          // Make x y coordinates
          intensities.forEach(function(d, i) {
            points.push({
              x: attribute,
              y: d,
              z: sampleNames[i],
            });
          });

          dataStore.push({
            attributeName: attribute,
            boxPlotStatistics: boxPlotStatistics,
            points: points
          });
        });

        console.log('d3 munged data', dataStore);

        // d3 margin convention. Make the width and height relative to page components
        var margin = {top: 20, bottom: 75, right: 20, left: 60},
            width = $('#gene-row-info').width() - margin.right - margin.left,
            height = $('#genes_table_wrapper').height() - margin.top - margin.bottom - 50;

        // Initialise the svg
        var svg = d3.select(plotDiv)
          .append('svg')
          .attr('width', width + margin.left + margin.right)
          .attr('height', height + margin.top + margin.bottom)
          .classed("d3-intensity-chart", true);

        // Make the graphing area
        var graph = svg.append('g')
          .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

        // set the x and y scale functions
        var yScale = d3.scaleLinear()
          .domain([0, maxOverallIntensity*1.1]) // add some extra space at the top of the y axis with *1.1
          .range([height, 0]);
        var xScale = d3.scalePoint()
          .domain(attributes)
          .range([0, width])
          .round(true)
          .padding(0.5);

        // x axis
        graph.append('g')
          .attr('transform', 'translate(0,' + height + ')')
          .call(d3.axisBottom(xScale))
          .selectAll("text")
          .attr('y', -5) // rotate and adjust tick positions
          .attr('x', -30)
          .attr('transform', 'rotate(270)');

        // y axis
        graph.append('g')
          .call(d3.axisLeft(yScale)
          .ticks(5, 'e')); // scientific notation

        // y axis label
        svg.append("text")
          .text('Relative intensity')
          .attr('transform', 'translate(' + margin.left/6 +  ',' + (height*0.75) + ') rotate(270)');

        // make a group for each
        var pointStep = xScale.step(),
            horizontalLineWidth = pointStep/4;

        // Functions for mouseover
        function displaySampleName(d, i) {
          var circle = d3.select(this);
          d3.select(this)
            .attr('fill', 'blue')
            .attr('r', 10);

          svg.append('text')
            .attr('id', function() { return 'sample-name-text-' + d.z.split('.')[0]; })
            .attr('x', (width + margin.top + margin.bottom) / 2)
            .attr('y', margin.top)
            .text(function() { return d.z.split('.')[0]; });
        }

        function hideSampleName(d, i) {
          d3.select(this)
            .attr('fill', 'black')
            .attr('r', 3);

          d3.select('#sample-name-text-' + d.z.split('.')[0]).remove();
        }

        var dataSeriesGroups = graph.selectAll('g .data-series-group')
          .data(dataStore)
          .enter()
          .append('g')
          .attr('class', 'data-series-group')
          .attr('id', function(d) { return 'data-series-' + d.attribute; });

        dataSeriesGroups.each(function(attribute, i) {
          var coordinates = attribute.points;
          var boxPlotStatistics = [attribute.boxPlotStatistics],
            g = d3.select(this);

          // Add circles for each data point
          g.selectAll('circle')
            .data(coordinates)
            .enter()
            .append('circle')
            .attr('cx', function(d) { return xScale(d.x); })
            .attr('cy', function(d) { return yScale(d.y); })
            .attr('r', 3)
            .attr('sample-name', function(d) { return d.z; })
            .on('mouseover', displaySampleName)
            .on('mouseout', hideSampleName);

          // Median line
          g.selectAll('line .median-line')
            .data(boxPlotStatistics)
            .enter()
            .append('line')
            .attr('class', 'median-line')
            .attr('x1', xScale(attribute.attributeName) -  horizontalLineWidth)
            .attr('x2', xScale(attribute.attributeName) +  horizontalLineWidth)
            .attr('y1', function(d) { return yScale(d.median); })
            .attr('y2', function(d) { return yScale(d.median); })
            .attr('stroke', 'black');

          // Quantile box
          g.selectAll('rect .quantile-box')
            .data(boxPlotStatistics)
            .enter()
            .append('rect')
            .attr('class', 'quantile-box')
            .attr('x', xScale(attribute.attributeName) - horizontalLineWidth)
            .attr('y', function(d) { return yScale(d.upperquantile); })
            .attr('width', horizontalLineWidth*2)
            .attr('height', function(d) { return (yScale(d.lowerquantile) - yScale(d.upperquantile)); })
            .attr('stroke', 'black')
            .style('fill', 'none');

          // horizontal line for upper whisker
          g.selectAll('line .upper-whisker-horizontal-line')
            .data(boxPlotStatistics)
            .enter()
            .append('line')
            .attr('class', 'upper-whisker-line')
            .attr('x1', function(d) { return xScale(attribute.attributeName) -  horizontalLineWidth; })
            .attr('x2', function(d) { return xScale(attribute.attributeName) +  horizontalLineWidth; })
            .attr('y1', function(d) { return yScale(d.maxi); })
            .attr('y2', function(d) { return yScale(d.maxi); })
            .attr('stroke', 'black');

          // vertical line for upper whisker
          g.selectAll('line .upper-whisker-vertical-line')
            .data(boxPlotStatistics)
            .enter()
            .append('line')
            .attr('class', '.upper-whisker-vertical-line')
            .attr('x1', function(d) { return xScale(attribute.attributeName); })
            .attr('x2', function(d) { return xScale(attribute.attributeName); })
            .attr('y1', function(d) { return yScale(d.lowerquantile); })
            .attr('y2', function(d) { return yScale(d.mini); })
            .attr('stroke', 'black');


          // horizontal line for lower whisker
          g.selectAll('line .lower-whisker-horizonal-line')
            .data(boxPlotStatistics)
            .enter()
            .append('line')
            .attr('class', 'upper-lower-line')
            .attr('x1', function(d) { return xScale(attribute.attributeName) -  horizontalLineWidth; })
            .attr('x2', function(d) { return xScale(attribute.attributeName) +  horizontalLineWidth; })
            .attr('y1', function(d) { return yScale(d.mini); })
            .attr('y2', function(d) { return yScale(d.mini); })
            .attr('stroke', 'black');

          // vertical line for lower whisker
          g.selectAll('line .lower-whisker-vertical-line')
            .data(boxPlotStatistics)
            .enter()
            .append('line')
            .attr('class', '.lower-whisker-vertical-line')
            .attr('x1', function(d) { return xScale(attribute.attributeName); })
            .attr('x2', function(d) { return xScale(attribute.attributeName); })
            .attr('y1', function(d) { return yScale(d.upperquantile); })
            .attr('y2', function(d) { return yScale(d.maxi); })
            .attr('stroke', 'black');
        }); // end dataSeriesGroups.each

    }

}

export default InfoPanesManager;