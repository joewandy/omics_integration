# Generated by Django 2.2.13 on 2020-08-17 11:15

from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('linker', '0040_auto_20200221_1105'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='analysisdata',
            name='display_name',
        ),
        migrations.RemoveField(
            model_name='analysisdata',
            name='inference_type',
        ),
        migrations.RemoveField(
            model_name='analysisdata',
            name='parent',
        ),
        migrations.RemoveField(
            model_name='analysisdata',
            name='timestamp',
        ),
        migrations.CreateModel(
            name='AnalysisHistory',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('display_name', models.CharField(blank=True, max_length=1000, null=True)),
                ('inference_type', models.IntegerField(blank=True, choices=[(None, '-'), (0, 'Differential Expression Analysis (t-test)'), (6, 'Differential Expression Analysis (DESeq2)'), (7, 'Differential Expression Analysis (limma)'), (2, 'Principal Component Analysis (PCA)'), (3, 'Pathway Analysis (PLAGE)'), (4, 'Pathway Analysis (ORA)'), (5, 'Pathway Analysis (GSEA)'), (8, 'Reactome Analysis Service')], null=True)),
                ('timestamp', models.DateTimeField(default=django.utils.timezone.localtime)),
                ('analysis', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='linker.Analysis')),
                ('analysis_data', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='linker.AnalysisData')),
            ],
            options={
                'verbose_name_plural': 'Analysis Histories',
            },
        ),
    ]
