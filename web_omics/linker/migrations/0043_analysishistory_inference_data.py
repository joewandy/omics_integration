# Generated by Django 2.2.13 on 2020-08-22 12:23

from django.db import migrations
import jsonfield.fields


class Migration(migrations.Migration):

    dependencies = [
        ('linker', '0042_analysisdata_timestamp'),
    ]

    operations = [
        migrations.AddField(
            model_name='analysishistory',
            name='inference_data',
            field=jsonfield.fields.JSONField(default='null'),
            preserve_default=False,
        ),
    ]
