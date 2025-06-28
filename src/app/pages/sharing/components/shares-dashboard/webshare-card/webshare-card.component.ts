import { AsyncPipe } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, OnInit,
} from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatCard } from '@angular/material/card';
import { MatToolbarRow } from '@angular/material/toolbar';
import { Router, RouterLink } from '@angular/router';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { Store } from '@ngrx/store';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import {
  filter, switchMap, map, take, combineLatest, of, catchError,
} from 'rxjs';
import { RequiresRolesDirective } from 'app/directives/requires-roles/requires-roles.directive';
import { EmptyType } from 'app/enums/empty-type.enum';
import { Role } from 'app/enums/role.enum';
import { ServiceName } from 'app/enums/service-name.enum';
import { EmptyConfig } from 'app/interfaces/empty-config.interface';
import { TruenasConnectConfig } from 'app/interfaces/truenas-connect-config.interface';
import { DialogService } from 'app/modules/dialog/dialog.service';
import { EmptyComponent } from 'app/modules/empty/empty.component';
import { EmptyService } from 'app/modules/empty/empty.service';
import { iconMarker } from 'app/modules/ix-icon/icon-marker.util';
import { IxIconComponent } from 'app/modules/ix-icon/ix-icon.component';
import { AsyncDataProvider } from 'app/modules/ix-table/classes/async-data-provider/async-data-provider';
import { IxTableComponent } from 'app/modules/ix-table/components/ix-table/ix-table.component';
import { actionsColumn } from 'app/modules/ix-table/components/ix-table-body/cells/ix-cell-actions/ix-cell-actions.component';
import { textColumn } from 'app/modules/ix-table/components/ix-table-body/cells/ix-cell-text/ix-cell-text.component';
import { IxTableBodyComponent } from 'app/modules/ix-table/components/ix-table-body/ix-table-body.component';
import { IxTableHeadComponent } from 'app/modules/ix-table/components/ix-table-head/ix-table-head.component';
import { IxTablePagerShowMoreComponent } from 'app/modules/ix-table/components/ix-table-pager-show-more/ix-table-pager-show-more.component';
import { IxTableEmptyDirective } from 'app/modules/ix-table/directives/ix-table-empty.directive';
import { createTable } from 'app/modules/ix-table/utils';
import { SlideIn } from 'app/modules/slide-ins/slide-in';
import { SnackbarService } from 'app/modules/snackbar/services/snackbar.service';
import { TestDirective } from 'app/modules/test-id/test.directive';
import { ApiService } from 'app/modules/websocket/api.service';
import { ServiceExtraActionsComponent } from 'app/pages/sharing/components/shares-dashboard/service-extra-actions/service-extra-actions.component';
import { ServiceStateButtonComponent } from 'app/pages/sharing/components/shares-dashboard/service-state-button/service-state-button.component';
import { WebShareAltrootFormComponent } from 'app/pages/sharing/webshare/webshare-altroot-form/webshare-altroot-form.component';
import { AppState } from 'app/store';
import { selectService } from 'app/store/services/services.selectors';
import { waitForSystemInfo } from 'app/store/system-info/system-info.selectors';

export interface WebShareTableRow {
  name: string;
  path: string;
  search_indexed?: boolean;
}

@UntilDestroy()
@Component({
  selector: 'ix-webshare-card',
  templateUrl: './webshare-card.component.html',
  styleUrls: ['./webshare-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    AsyncPipe,
    MatCard,
    MatToolbarRow,
    MatButton,
    RouterLink,
    IxIconComponent,
    RequiresRolesDirective,
    ServiceStateButtonComponent,
    ServiceExtraActionsComponent,
    TestDirective,
    TranslateModule,
    EmptyComponent,
    IxTableComponent,
    IxTableHeadComponent,
    IxTableBodyComponent,
    IxTableEmptyDirective,
    IxTablePagerShowMoreComponent,
  ],
})
export class WebShareCardComponent implements OnInit {
  readonly requiredRoles = [Role.SharingWrite];

  service$ = this.store$.select(selectService(ServiceName.WebShare));
  protected dataProvider: AsyncDataProvider<WebShareTableRow>;

  hasValidLicense$ = combineLatest([
    this.store$.pipe(
      waitForSystemInfo,
      map((systemInfo) => systemInfo.license !== null),
    ),
    this.api.call('tn_connect.config').pipe(
      map((config: TruenasConnectConfig) => config?.enabled),
      catchError(() => of(false)),
    ),
  ]).pipe(
    map(([hasLicense, tnConnectEnabled]) => hasLicense || tnConnectEnabled),
  );

  emptyConfig: EmptyConfig = {
    type: EmptyType.NoPageData,
    title: '',
    message: this.translate.instant(
      'WebShare service provides web-based file access.<br><br>Users can access these shares if they have the WebShare Enabled option set on their account.',
    ),
    icon: iconMarker('ix-webshare'),
    large: true,
  };

  columns = createTable<WebShareTableRow>([
    textColumn({
      title: this.translate.instant('Name'),
      propertyName: 'name',
    }),
    textColumn({
      title: this.translate.instant('Path'),
      propertyName: 'path',
    }),
    actionsColumn({
      actions: [
        {
          iconName: iconMarker('edit'),
          tooltip: this.translate.instant('Edit'),
          onClick: (row) => this.doEdit(row),
        },
        {
          iconName: iconMarker('mdi-delete'),
          tooltip: this.translate.instant('Delete'),
          onClick: (row) => this.doDelete(row),
          requiredRoles: this.requiredRoles,
        },
      ],
    }),
  ], {
    uniqueRowTag: (row) => 'card-webshare-' + row.name,
    ariaLabels: (row) => [row.name, this.translate.instant('WebShare')],
  });

  constructor(
    private api: ApiService,
    private slideIn: SlideIn,
    private router: Router,
    private translate: TranslateService,
    private dialog: DialogService,
    private snackbar: SnackbarService,
    protected emptyService: EmptyService,
    private store$: Store<AppState>,
  ) {}

  ngOnInit(): void {
    const webshares$ = this.api.call('webshare.config').pipe(
      map((config) => {
        if (!config.altroots) {
          return [];
        }
        return Object.entries(config.altroots).map(([name, path]) => ({
          name,
          path,
          search_indexed: config.altroots_metadata?.[name]?.search_indexed ?? true,
        }));
      }),
      untilDestroyed(this),
    );

    this.dataProvider = new AsyncDataProvider<WebShareTableRow>(webshares$);
    this.dataProvider.load();
  }

  onAddClicked(): void {
    this.hasValidLicense$.pipe(
      take(1),
      filter(Boolean),
      untilDestroyed(this),
    ).subscribe(() => {
      const slideInRef$ = this.slideIn.open(WebShareAltrootFormComponent, {
        data: { isNew: true, name: '', path: '' },
      });

      slideInRef$
        .pipe(filter(Boolean), untilDestroyed(this))
        .subscribe(() => {
          this.dataProvider.load();
        });
    });
  }

  protected doEdit(row: WebShareTableRow): void {
    const slideInRef$ = this.slideIn.open(WebShareAltrootFormComponent, {
      data: {
        isNew: false,
        name: row.name,
        path: row.path,
        search_indexed: row.search_indexed,
      },
    });

    slideInRef$
      .pipe(filter(Boolean), untilDestroyed(this))
      .subscribe(() => {
        this.dataProvider.load();
      });
  }

  protected doDelete(row: WebShareTableRow): void {
    this.dialog.confirm({
      title: this.translate.instant('Delete WebShare'),
      message: this.translate.instant(
        'Are you sure you want to delete the WebShare "{name}"? Users will no longer be able to access {path} through WebShare.',
        { name: row.name, path: row.path },
      ),
      buttonText: this.translate.instant('Delete'),
      buttonColor: 'warn',
    })
      .pipe(
        filter(Boolean),
        switchMap(() => {
          return this.api.call('webshare.config').pipe(
            switchMap((config) => {
              const updatedAltroots = { ...config.altroots };
              const updatedMetadata = { ...(config.altroots_metadata || {}) };
              delete updatedAltroots[row.name];
              delete updatedMetadata[row.name];
              return this.api.call('webshare.update', [{
                altroots: updatedAltroots,
                altroots_metadata: updatedMetadata,
              }]);
            }),
          );
        }),
        untilDestroyed(this),
      )
      .subscribe({
        next: () => {
          this.snackbar.success(this.translate.instant('WebShare deleted'));
          this.dataProvider.load();
        },
        error: (error: unknown) => {
          this.dialog.error({
            title: this.translate.instant('Error deleting WebShare'),
            message: (error as Error).message,
          });
        },
      });
  }
}
