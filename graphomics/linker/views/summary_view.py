import pandas as pd
from django.core.exceptions import PermissionDenied
from django.http import HttpResponse
from django.shortcuts import render, get_object_or_404

from linker.common import access_allowed
from linker.constants import *
from linker.models import Analysis, AnalysisData, AnalysisAnnotation
from linker.views.functions import get_last_analysis_data


def summary(request, analysis_id):
    analysis = get_object_or_404(Analysis, pk=analysis_id)
    if not access_allowed(analysis, request):
        raise PermissionDenied()

    observed_genes, inferred_genes, total_genes = get_counts(analysis, GENOMICS)
    observed_proteins, inferred_proteins, total_proteins = get_counts(analysis, PROTEOMICS)
    observed_compounds, inferred_compounds, total_compounds = get_counts(analysis, METABOLOMICS)
    reaction_count, pathway_count = get_reaction_pathway_counts(analysis)
    gene_samples = get_samples(analysis, GENOMICS)
    protein_samples = get_samples(analysis, PROTEOMICS)
    compound_samples = get_samples(analysis, METABOLOMICS)
    annotations = get_annotations(analysis)
    compound_database = analysis.metadata['compound_database_str']
    data = {
        'observed_genes': observed_genes,
        'observed_proteins': observed_proteins,
        'observed_compounds': observed_compounds,
        'inferred_genes': inferred_genes,
        'inferred_proteins': inferred_proteins,
        'inferred_compounds': inferred_compounds,
        'total_genes': total_genes,
        'total_proteins': total_proteins,
        'total_compounds': total_compounds,
        'num_reactions': reaction_count,
        'num_pathways': pathway_count,
        'gene_samples': gene_samples,
        'protein_samples': protein_samples,
        'compound_samples': compound_samples,
        'annotations': annotations,
        'compound_database': compound_database,
    }
    context = {
        'analysis_id': analysis.pk,
        'data': data,
        'read_only': analysis.get_read_only_status(request.user)
    }
    return render(request, 'linker/summary.html', context)


def download_list(request, analysis_id, data_type, observed, id_or_pk):
    observed = (observed == 'True')
    analysis = get_object_or_404(Analysis, pk=analysis_id)
    if not access_allowed(analysis, request):
        raise PermissionDenied()

    observed_list, inferred_list = get_names(analysis, int(data_type), id_or_pk)
    if observed:
        content = '\n'.join(observed_list)
    else:
        content = '\n'.join(inferred_list)
    return HttpResponse(content, content_type='text/plain')


def get_counts(analysis, data_type):
    analysis_data = get_last_analysis_data(analysis, data_type)
    json_data = analysis_data.json_data
    df = pd.DataFrame(json_data)
    observed = df[df['obs'] == True].shape[0]
    inferred = df[df['obs'] == False].shape[0] - 1  # -1 to account for dummy item
    total = observed + inferred
    return observed, inferred, total


def get_names(analysis, data_type, id_or_pk):
    analysis_data = get_last_analysis_data(analysis, data_type)
    json_data = analysis_data.json_data
    df = pd.DataFrame(json_data)
    if id_or_pk == 'id':
        id_names = {
            GENOMICS: 'gene_id',
            PROTEOMICS: 'protein_id',
            METABOLOMICS: 'compound_id'
        }
    else:
        id_names = {
            GENOMICS: 'gene_pk',
            PROTEOMICS: 'protein_pk',
            METABOLOMICS: 'compound_pk'
        }
    id_name = id_names[data_type]
    observed = df[df['obs'] == True][id_name].tolist()
    inferred = df[df['obs'] == False][id_name].tolist()
    return sorted(observed), sorted(inferred)


def get_reaction_pathway_counts(analysis):
    analysis_data = AnalysisData.objects.filter(analysis=analysis, data_type=REACTIONS).first()
    reaction_count = pd.DataFrame(analysis_data.json_data).shape[0] - 1
    analysis_data = AnalysisData.objects.filter(analysis=analysis, data_type=PATHWAYS).first()
    pathway_count = pd.DataFrame(analysis_data.json_data).shape[0] - 1
    return reaction_count, pathway_count


def get_samples(analysis, data_type):
    analysis_data = AnalysisData.objects.filter(analysis=analysis, data_type=data_type).first()
    if analysis_data.json_design is not None:
        df = pd.DataFrame(analysis_data.json_design)
        df.insert(1, FACTOR_COL, GROUP_COL)
        df.sort_values(by=SAMPLE_COL, inplace=True)
        results = df.values
    else:
        results = []
    return results


def get_annotations(analysis):
    annotations = AnalysisAnnotation.objects.filter(analysis=analysis).order_by('data_type', 'database_id')
    results = []
    for annot in annotations:
        url = get_url(annot.data_type, annot.database_id)
        results.append((to_label(annot.data_type), annot.database_id, annot.annotation, url, annot.display_name))
    return results


def to_label(data_type):
    keys = [GENOMICS, PROTEOMICS, METABOLOMICS, REACTIONS, PATHWAYS]
    values = ['Gene Data', 'Protein Data', 'Compound Data', 'Reaction Data', 'Pathway Data']
    mapping = dict(zip(keys, values))
    return mapping[data_type]


def get_url(data_type, database_id):
    if data_type == GENOMICS:
        return 'https://www.ensembl.org/id/' + database_id
    elif data_type == PROTEOMICS:
        return 'http://www.uniprot.org/uniprot/' + database_id
    elif data_type == METABOLOMICS:
        return 'https://www.ebi.ac.uk/chebi/searchId.do?chebiId=CHEBI:' + database_id
    elif data_type == REACTIONS or data_type == PATHWAYS:
        return 'https://reactome.org/content/detail/' + database_id
