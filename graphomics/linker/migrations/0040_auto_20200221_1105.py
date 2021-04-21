# Generated by Django 2.2.9 on 2020-02-21 11:05

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('linker', '0039_auto_20200218_1342'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='analysis',
            name='owner',
        ),
        migrations.CreateModel(
            name='Share',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('read_only', models.BooleanField()),
                ('owner', models.BooleanField()),
                ('analysis', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='linker.Analysis')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.AddField(
            model_name='analysis',
            name='users',
            field=models.ManyToManyField(through='linker.Share', to=settings.AUTH_USER_MODEL),
        ),
    ]