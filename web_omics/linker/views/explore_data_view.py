import collections
import json

import numpy as np
import pandas as pd
from django.core.exceptions import ObjectDoesNotExist
from django.http import JsonResponse
from django.shortcuts import render, get_object_or_404
from django.urls import reverse
from django.utils import timezone
import plotly.graph_objects as go

from linker.constants import *
from linker.metadata import get_single_ensembl_metadata_online, get_single_uniprot_metadata_online, \
    get_single_compound_metadata_online
from linker.models import Analysis, AnalysisAnnotation, AnalysisGroup
from linker.reactome import get_reactome_description, get_reaction_entities, pathway_to_reactions
from linker.views.functions import change_column_order, recur_dictify, get_context, \
    get_last_data, get_dataframes, fig_to_div
from .harmonizomeapi import Harmonizome, Entity


def truncate(my_str):
    my_str = (my_str[:TRUNCATE_LIMIT] + '...') if len(my_str) > TRUNCATE_LIMIT else my_str
    return my_str


def explore_data(request, analysis_id):
    analysis = get_object_or_404(Analysis, pk=analysis_id)
    context = get_context(analysis)
    return render(request, 'linker/explore_data.html', context)


def list_groups(request, analysis_id):
    analysis = Analysis.objects.get(id=analysis_id)
    analysis_groups = AnalysisGroup.objects.filter(analysis=analysis).order_by('-timestamp')
    data = { 'list' : [] }
    for g in analysis_groups:
        label = g.display_name
        value = g.id
        data['list'].append({ 'label' : label, 'value' : value })
    return JsonResponse(data)


def clustergrammer_demo(request):
    context = {}
    return render(request, 'linker/clustergrammer_demo.html', context)


def get_firdi_data(request, analysis_id):
    if request.is_ajax():
        analysis = get_object_or_404(Analysis, pk=analysis_id)
        table_data = {}
        data_fields = {}
        for k, v in DataRelationType:
            try:
                analysis_data = get_last_data(analysis, k)
                label = MAPPING[k]
                table_data[label] = analysis_data.json_data
                if analysis_data.json_design:
                    data_fields[TABLE_IDS[k]] = list(set(pd.DataFrame(analysis_data.json_design)[SAMPLE_COL]))
            except IndexError:
                continue
            except KeyError:
                continue

        data = {
            'tableData': table_data,
            'tableFields': data_fields,
        }
        return JsonResponse(data)


def get_heatmap_data(request, analysis_id):
    if request.is_ajax():
        analysis = get_object_or_404(Analysis, pk=analysis_id)
        cluster_data = {}
        for k, v in DataRelationType:
            try:
                analysis_data = get_last_data(analysis, k)
                if analysis_data.metadata and 'clustergrammer' in analysis_data.metadata:
                    cluster_data[MAPPING[k]] = analysis_data.metadata['clustergrammer']
            except IndexError:
                continue
            except KeyError:
                continue

        return JsonResponse(cluster_data)


def inference(request, analysis_id):
    analysis = get_object_or_404(Analysis, pk=analysis_id)
    context = {
        'analysis_id': analysis.pk
    }
    return render(request, 'linker/inference.html', context)


def settings(request, analysis_id):
    analysis = get_object_or_404(Analysis, pk=analysis_id)
    context = {
        'analysis_id': analysis.pk
    }
    return render(request, 'linker/settings.html', context)


def get_ensembl_gene_info(request, analysis_id):
    if request.is_ajax():
        ensembl_id = request.GET['id']
        metadata = get_single_ensembl_metadata_online(ensembl_id)
        display_name = metadata['display_name'] if metadata is not None else ''

        infos = []
        if metadata is not None:
            # selected = ['description', 'species', 'biotype', 'db_type', 'logic_name', 'strand', 'start', 'end']
            selected = ['description', 'species']
            for key in selected:
                value = metadata[key]
                if key == 'description':
                    value = value[0:value.index('[')]  # remove e.g. '[xxx]' from 'abhydrolase [xxx]'
                infos.append({'key': key.title(), 'value': value})

        data = Harmonizome.get(Entity.GENE, name=display_name)
        try:
            description = data['description']
            infos.append({'key': 'Description', 'value': description})
        except KeyError:
            pass

        # try:
        #     summary = get_entrez_summary(ensembl_id)
        #     infos.append({'key': 'Entrez Summary', 'value': truncate(summary)})
        # except TypeError:
        #     pass

        images = []
        links = [
            {
                'text': 'Link to Ensembl',
                'href': 'https://www.ensembl.org/id/' + ensembl_id
            },
            {
                'text': 'Link to GeneCard',
                'href': 'https://www.genecards.org/cgi-bin/carddisp.pl?gene=' + display_name
            }
        ]
        # for x in metadata['Transcript']:
        #     text = 'Transcript: ' + x['display_name']
        #     href = 'https://www.ensembl.org/id/' + x['id']
        #     links.append({'text': text, 'href': href})

        annotation = get_annotation(analysis_id, ensembl_id, GENOMICS)
        annotation_url = get_annotation_url(analysis_id, ensembl_id, GENOMICS)
        data = {
            'infos': infos,
            'images': images,
            'links': links,
            'annotation': annotation,
            'annotation_url': annotation_url,
            'annotation_id': ensembl_id
        }
        measurements = get_grouped_measurements(analysis_id, ensembl_id, GENOMICS)
        if measurements is not None:
            data['plot_data'] = measurements
        return JsonResponse(data)


def get_uniprot_protein_info(request, analysis_id):
    if request.is_ajax():
        uniprot_id = request.GET['id']

        infos = []                                                                                                                                                                     
        try:
            metadata = get_single_uniprot_metadata_online(uniprot_id)
            try:
                fullname = [x.text for x in metadata.soup.select('protein > recommendedname > fullname')][0]
            except IndexError:
                fullname = uniprot_id

            shortName = None
            try:
                shortname = [x.text for x in metadata.soup.select('protein > recommendedname > shortname')][0]
            except IndexError:
                pass

            if shortName is not None:
                infos.append({'key': 'Name', 'value': "{} ({})".format(fullname, shortname)})
            else:
                infos.append({'key': 'Name', 'value': "{}".format(fullname)})

            try:
                ecnumber = [x.text for x in metadata.soup.select('protein > recommendedname > ecnumber')][0]
                infos.append({'key': 'EC Number', 'value': 'EC' + ecnumber})
            except IndexError:
                pass

            # get comments
            selected = ['function', 'catalytic activity', 'enzyme regulation', 'subunit', 'pathway', 'miscellaneous',
                        'domain']
            for child in metadata.soup.find_all('comment'):
                try:
                    if child['type'] in selected:
                        key = child['type'].title()
                        if key == 'Function':  # quick-hack
                            key = 'Summary'
                        infos.append({'key': key, 'value': truncate(child.text)})
                except KeyError:
                    continue

            # gene ontologies
            go = []
            for child in metadata.soup.find_all('dbreference'):
                try:
                    if child['type'] == 'GO':
                        props = child.find_all('property')
                        for prop in props:
                            if prop['type'] == 'term':
                                go.append(prop['value'].split(':')[1])
                except KeyError:
                    continue
            go_str = '; '.join(sorted(go))
            go_str = truncate(go_str)
            infos.append({'key': 'Gene_ontologies', 'value': go_str})

        except TypeError:
            pass

        images = []
        # with urllib.request.urlopen('https://swissmodel.expasy.org/repository/uniprot/' + uniprot_id + '.json') as url:
        #     data = json.loads(url.read().decode())
        #     for struct in data['result']['structures']:
        #         pdb_link = struct['coordinates']
        #         images.append(pdb_link)

        links = [
            {
                'text': 'Link to UniProt',
                'href': 'http://www.uniprot.org/uniprot/' + uniprot_id
            },
            {
                'text': 'Link to SWISS-MODEL',
                'href': 'https://swissmodel.expasy.org/repository/uniprot/' + uniprot_id
            }
        ]

        annotation = get_annotation(analysis_id, uniprot_id, PROTEOMICS)
        annotation_url = get_annotation_url(analysis_id, uniprot_id, PROTEOMICS)
        data = {
            'infos': infos,
            'images': images,
            'links': links,
            'annotation': annotation,
            'annotation_url': annotation_url,
            'annotation_id': uniprot_id
        }
        measurements = get_grouped_measurements(analysis_id, uniprot_id, PROTEOMICS)
        if measurements is not None:
            data['plot_data'] = measurements
        return JsonResponse(data)


def get_kegg_metabolite_info(request, analysis_id):
    if request.is_ajax():

        compound_id = request.GET['id']
        if '_' in compound_id:
            tokens = compound_id.split('_')
            assert len(tokens) == 2
            compound_id = tokens[0]
            peak_id = tokens[1]
        else:
            peak_id = None

        metadata = get_single_compound_metadata_online(compound_id)

        if compound_id.upper().startswith('C'):  # assume it's kegg

            # TODO: no longer used??!!

            infos = []
            selected = ['FORMULA']
            if metadata is not None:
                for key in selected:
                    value = metadata[key]
                    infos.append({'key': key, 'value': str(value)})

            key = 'PiMP Peak ID'
            value = peak_id
            infos.append({'key': key, 'value': str(value)})

            images = ['http://www.kegg.jp/Fig/compound/' + compound_id + '.gif']
            links = [
                {
                    'text': 'Link to KEGG COMPOUND database',
                    'href': 'http://www.genome.jp/dbget-bin/www_bget?cpd:' + compound_id
                }
            ]

        else:  # assume it's ChEBI

            def get_attribute(metadata, attrname):
                try:
                    attr_val = getattr(metadata, attrname)
                except AttributeError:
                    attr_val = ''
                return attr_val

            images = [
                'http://www.ebi.ac.uk/chebi/displayImage.do?defaultImage=true&imageIndex=0&chebiId=' + compound_id]
            links = [
                {
                    'text': 'Link to ChEBI database',
                    'href': 'https://www.ebi.ac.uk/chebi/searchId.do?chebiId=CHEBI:' + compound_id
                }
            ]

            infos = []
            key = 'PiMP Peak ID'
            value = peak_id
            infos.append({'key': key, 'value': str(value)})

            try:
                for db_link in metadata.DatabaseLinks:
                    if 'KEGG COMPOUND' in str(db_link.type):
                        kegg_id = db_link.data
                        infos.append({'key': 'KEGG ID', 'value': kegg_id})
                        links.append({
                            'text': 'Link to KEGG COMPOUND database',
                            'href': 'http://www.genome.jp/dbget-bin/www_bget?cpd:' + kegg_id
                        })
            except AttributeError:
                pass

            try:
                infos.append({'key': 'FORMULA', 'value': metadata.Formulae[0].data})
            except AttributeError:
                pass
            selected = [
                ('ChEBI ID', 'chebiId'),
                ('Definition', 'definition'),
                ('Monoisotopic Mass', 'monoisotopicMass'),
                ('SMILES', 'smiles'),
                # ('Inchi', 'inchi'),
                # ('InchiKey', 'inchikey'),
            ]
            for key, attribute in selected:
                value = get_attribute(metadata, attribute)
                if value is not None:
                    infos.append({'key': key, 'value': value})

        annotation = get_annotation(analysis_id, compound_id, METABOLOMICS)
        annotation_url = get_annotation_url(analysis_id, compound_id, METABOLOMICS)
        data = {
            'infos': infos,
            'images': images,
            'links': links,
            'annotation': annotation,
            'annotation_url': annotation_url,
            'annotation_id': compound_id
        }
        measurements = get_grouped_measurements(analysis_id, compound_id, METABOLOMICS, peak_id=peak_id)
        if measurements is not None:
            data['plot_data'] = measurements
        return JsonResponse(data)


def get_summary_string(reactome_id):
    desc, is_inferred = get_reactome_description(reactome_id, from_parent=False)
    original_species = desc[0]['species']
    if is_inferred:
        desc, _ = get_reactome_description(reactome_id, from_parent=True)
        inferred_species = desc[0]['species']
    else:
        inferred_species = original_species

    summary_list = []
    for s in desc:
        if s['summary_text'] is None:
            continue
        st = s['summary_text'].replace(';', ',')
        summary_list.append(truncate(st))
    summary_str = ';'.join(summary_list)
    return summary_str, is_inferred, original_species, inferred_species


def get_reactome_reaction_info(request, analysis_id):
    if request.is_ajax():
        reactome_id = request.GET['id']

        infos = []

        # res = get_reactome_content_service(reactome_id)
        # summary_str = res['summation'][0]['text']
        summary_str, is_inferred, original_species, inferred_species = get_summary_string(reactome_id)
        infos.append({'key': 'Summary', 'value': summary_str})

        infos.append({'key': 'Species', 'value': original_species})
        if is_inferred:
            inferred = 'Inferred from %s' % inferred_species
            infos.append({'key': 'Inferred', 'value': inferred})

        # get all the participants
        temp = collections.defaultdict(list)
        results = get_reaction_entities([reactome_id])[reactome_id]
        for res in results:
            entity_id = res[1]
            display_name = res[2]
            relationship_types = res[3]
            if len(relationship_types) == 1:  # ignore the sub-complexes
                rel = relationship_types[0]
                temp[rel].append((display_name, entity_id,))

        for k, v in temp.items():
            name_list, url_list = zip(
                *v)  # https://stackoverflow.com/questions/12974474/how-to-unzip-a-list-of-tuples-into-individual-lists
            url_list = map(lambda x: 'https://reactome.org/content/detail/' + x if x is not None else '', url_list)

            name_str = ';'.join(name_list)
            url_str = ';'.join(url_list)
            infos.append({'key': k.title(), 'value': name_str, 'url': url_str})

        images = [
            'https://reactome.org/ContentService/exporter/diagram/' + reactome_id + '.jpg?sel=' + reactome_id + "&quality=7"
        ]
        links = [
            {
                'text': 'Link to Reactome database',
                'href': 'https://reactome.org/content/detail/' + reactome_id
            }
        ]
        annotation = get_annotation(analysis_id, reactome_id, REACTIONS)
        annotation_url = get_annotation_url(analysis_id, reactome_id, REACTIONS)
        data = {
            'infos': infos,
            'images': images,
            'links': links,
            'annotation': annotation,
            'annotation_url': annotation_url,
            'annotation_id': reactome_id
        }
        return JsonResponse(data)


def get_reactome_pathway_info(request, analysis_id):
    if request.is_ajax():

        pathway_id = request.GET['id']
        mapping, id_to_names = pathway_to_reactions([pathway_id])
        pathway_reactions = mapping[pathway_id]

        reaction_list = map(lambda x: id_to_names[x], pathway_reactions)
        reaction_str = ';'.join(sorted(reaction_list))

        url_list = map(lambda x: 'https://reactome.org/content/detail/' + x, pathway_reactions)
        url_str = ';'.join(sorted(url_list))

        # res = get_reactome_content_service(pathway_id)
        # summary_str = res['summation'][0]['text']
        summary_str, is_inferred, original_species, inferred_species = get_summary_string(pathway_id)

        infos = [{'key': 'Summary', 'value': summary_str}]
        infos.append({'key': 'Species', 'value': original_species})
        if is_inferred:
            inferred = 'Inferred from %s' % inferred_species
            infos.append({'key': 'Inferred', 'value': inferred})
        infos.append({'key': 'Reactions', 'value': reaction_str, 'url': url_str})

        images = [
            'https://reactome.org/ContentService/exporter/diagram/' + pathway_id + '.jpg?sel=' + pathway_id
        ]
        links = [
            {
                'text': 'Link to Reactome database',
                'href': 'https://reactome.org/content/detail/' + pathway_id
            },
            {
                'text': 'SBML Export',
                'href': 'https://reactome.org/ContentService/exporter/sbml/' + pathway_id + '.xml'
            }
        ]
        annotation = get_annotation(analysis_id, pathway_id, PATHWAYS)
        annotation_url = get_annotation_url(analysis_id, pathway_id, PATHWAYS)
        data = {
            'infos': infos,
            'images': images,
            'links': links,
            'annotation': annotation,
            'annotation_url': annotation_url,
            'annotation_id': pathway_id
        }
        return JsonResponse(data)


def get_short_info(request):
    if request.is_ajax():
        data_type = request.GET['data_type']
        display_name = request.GET['display_name']
        # to deal with duplicate indices
        if '-' in display_name:
            display_name = display_name.split('-')[0]

        description = ''
        if data_type == 'gene':
            try:
                results = Harmonizome.get(Entity.GENE, name=display_name)
                description = results['description']
            except KeyError:
                pass

        elif data_type == 'protein':
            metadata = get_single_uniprot_metadata_online(display_name)
            try:
                display_name = [x.text for x in metadata.soup.select('protein > recommendedname > fullname')][0]
                for child in metadata.soup.find_all('comment'):
                    if child['type'].title() == 'Function':
                        description = child.text
                        break
            except KeyError:
                pass
            except IndexError:
                pass

        elif data_type == 'compound':
            pass

        data = {
            'name': display_name,
            'description': description
        }
        return JsonResponse(data)


def get_annotation(analysis_id, database_id, data_type):
    analysis = Analysis.objects.get(id=analysis_id)
    try:
        annot = AnalysisAnnotation.objects.get(
            analysis=analysis,
            database_id=database_id,
            data_type=data_type
        )
        annotation = annot.annotation
    except ObjectDoesNotExist:
        annotation = ''
    return annotation


def get_annotation_url(analysis_id, database_id, data_type):
    annotation_url = reverse('update_annotation', kwargs={
        'analysis_id': analysis_id,
        'database_id': database_id,
        'data_type': data_type
    })
    return annotation_url


def update_annotation(request, analysis_id, database_id, data_type):
    analysis = Analysis.objects.get(id=analysis_id)
    annotation_value = request.POST['annotationValue']
    display_name = request.POST['displayName']
    annot = AnalysisAnnotation.objects.get_or_create(
        analysis=analysis,
        data_type=data_type,
        database_id=database_id,
    )[0]
    annot.annotation = annotation_value
    annot.display_name = display_name
    annot.timestamp = timezone.localtime()
    annot.save()
    data = {'success': True}
    return JsonResponse(data)


def save_group(request, analysis_id):
    analysis = Analysis.objects.get(id=analysis_id)
    group_name = request.POST.get('groupName')
    group_desc = request.POST.get('groupDesc')
    linker_state = request.POST.get('state')

    group = AnalysisGroup.objects.create(
        analysis=analysis,
        display_name=group_name,
        description=group_desc,
        linker_state=linker_state,
        timestamp=timezone.localtime()
    )
    group.save()

    data = {'success': True}
    return JsonResponse(data)


def load_group(request, analysis_id):
    analysis = Analysis.objects.get(id=analysis_id)
    group_id = int(request.GET['groupId'])
    group = AnalysisGroup.objects.get(id=group_id)
    linker_state = group.linker_state
    data = {'state': linker_state}
    return JsonResponse(data)


def get_grouped_measurements(analysis_id, database_id, data_type, peak_id=None):
    analysis = Analysis.objects.get(id=analysis_id)
    analysis_data = get_last_data(analysis, data_type)
    if analysis_data.json_design is None:
        return None

    exclude_colnames = ['obs', '_pk', '_id', 'significant_', 'padj_', 'FC_']
    for row in analysis_data.json_data:
        for key in row.keys():
            if '_id' in key or '_pk' in key:
                if peak_id:
                    search = '%s_%s' % (database_id, peak_id)
                else:
                    search = database_id
                if row[key] == search: # if found
                    # filter this row to remove exclude_colnames
                    filtered_data = filter_dict(row, exclude_colnames)
                    # check if there's some measurements (not all entries are None)
                    if not all(v is None for v in list(filtered_data.values())):
                        # then merge with the design matrix
                        filtered_df = pd.DataFrame([filtered_data]).astype(float)
                        design_df = pd.DataFrame(analysis_data.json_design)
                        merged_df = pd.merge(filtered_df.transpose(), design_df, left_index=True, right_on=SAMPLE_COL)
                        # put the columns in the right order, then return as dictionary
                        merged_df = change_column_order(merged_df, GROUP_COL, 0)
                        merged_df = change_column_order(merged_df, SAMPLE_COL, 1)
                        merged_dict = recur_dictify(merged_df)
                        return merged_dict
                    else:
                        return None
    return None


def filter_dict(my_dict, exclude_keys):
    filtered_dict = {key: my_dict[key] for key in my_dict if
                     all(substring not in key for substring in exclude_keys)}
    return filtered_dict


def get_boxplot(request, analysis_id):
    analysis = Analysis.objects.get(id=analysis_id)
    group_id = int(request.GET['groupId'])
    data_type = int(request.GET['dataType'])
    assert data_type in [GENOMICS, PROTEOMICS, METABOLOMICS]

    group = AnalysisGroup.objects.get(id=group_id)
    analysis_data = get_last_data(analysis, data_type)

    x, y_df = get_plotly_data(analysis_data, group, data_type)
    fig = get_plotly_boxplot(x, y_df)
    div = fig_to_div(fig)

    data = {'div': div}
    return JsonResponse(data)


def get_plotly_data(analysis_data, group, data_type):
    # create data, design and selection dataframes
    data_df, design_df = get_dataframes(analysis_data, pk_cols=IDS)
    if design_df is None: # no data
        return None, None

    table_name = TABLE_IDS[data_type]
    linker_state = json.loads(group.linker_state)
    id_col = IDS[data_type]
    selection_df = pd.DataFrame(linker_state['lastQueryResult'][table_name]).set_index(id_col)
    try:
        selection_df = selection_df.drop(labels=NA)
    except KeyError:
        pass # do nothing

    # construct x for boxplot
    x = design_df[GROUP_COL].values

    # construct y for boxplot
    y = np.log2(selection_df[design_df.index])
    return x, y


def get_plotly_boxplot(x, y_df):
    fig = go.Figure()
    if y_df is not None:
        for idx, row in y_df.iterrows():
            # print(idx, row.values)
            fig.add_trace(go.Box(
                y=row.values,
                x=x,
                name=idx,
            ))

    fig.update_layout(
        yaxis_title='log2(measurement)',
        boxmode='group' # group together boxes of the different traces for each value of x
    )
    return fig
