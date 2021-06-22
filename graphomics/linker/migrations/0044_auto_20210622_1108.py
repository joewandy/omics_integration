# Generated by Django 2.2.22 on 2021-06-22 10:08

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('linker', '0043_analysishistory_inference_data'),
    ]

    operations = [
        migrations.AddField(
            model_name='analysis',
            name='publication',
            field=models.CharField(max_length=1000, null=True),
        ),
        migrations.AddField(
            model_name='analysis',
            name='publication_link',
            field=models.CharField(max_length=1000, null=True),
        ),
        migrations.AlterField(
            model_name='analysishistory',
            name='inference_type',
            field=models.IntegerField(blank=True, choices=[(None, '-'), (1, 'Differential Expression Analysis (t-test)'), (7, 'Differential Expression Analysis (DESeq2)'), (8, 'Differential Expression Analysis (limma)'), (3, 'Principal Component Analysis (PCA)'), (4, 'Pathway Analysis (PLAGE)'), (5, 'Pathway Analysis (ORA)'), (6, 'Pathway Analysis (GSEA)'), (9, 'Reactome Analysis Service')], null=True),
        ),
    ]
